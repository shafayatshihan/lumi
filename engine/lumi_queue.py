"""The overnight queue (batch 2 P2): `.aura/queue.json`, the ONLY memory of what is still to build and render.

One global file, because both executors (Claude's Runner, BlenderRenderer) are process-wide singletons with one slot each.
It lives at the .aura root, a sibling of decks/, and NOT under temp/: reap() never walks the root, so the file is safe from
retention by construction rather than by promise. Written atomically on every change, like interview.json.

This module is only the store: ordering, the poison-job guard, the restart rule. Feeding the executors lives in
form_server.py (queue_tick), which takes this lock LAST and never calls out while holding it.

A job: {id, deck, slide, stage: build|render, state: pending|running|asking|done|failed, res, order, attempts, notBefore,
lastError: {code, reason, at} | None, execId, addedAt, startedAt, endedAt, est, framesDone}."""
import json, threading, time, uuid

STAGES = ('build', 'render')
LIVE = ('pending', 'running', 'asking')
MAX_ATTEMPTS = 3                 # three crashes on the same job is the job, not the power cut
DONE_KEEP_S = 24 * 3600          # a finished job is shown the next morning, then dropped; a failed one is never dropped


class Queue:
    def __init__(self, path, write_atomic, log=print):
        self.path, self._write, self._log = path, write_atomic, log
        self.lock = threading.RLock()
        self.jobs, self.paused, self.last_drain = [], [], None
        self.load()

    # ---- persistence
    def load(self):
        try:
            d = json.loads(self.path.read_text(encoding='utf-8'))
        except FileNotFoundError:
            return
        except (OSError, ValueError) as e:
            self._log('queue.json unreadable, starting empty', repr(e))
            return
        if not isinstance(d, dict): return
        self.jobs = [j for j in d.get('jobs') or [] if isinstance(j, dict) and j.get('id') and j.get('stage') in STAGES]
        self.paused = [p for p in d.get('paused') or [] if isinstance(p, str)]
        self.last_drain = d.get('lastDrain') if isinstance(d.get('lastDrain'), dict) else None

    def save(self):
        with self.lock:
            text = json.dumps({'v': 1, 'jobs': self.jobs, 'paused': self.paused, 'lastDrain': self.last_drain}, indent=1)
        try:
            self._write(self.path, text)
        except OSError as e:
            self._log('queue.json not saved', repr(e))

    # ---- reading
    def get(self, job_id):
        with self.lock:
            return next((j for j in self.jobs if j['id'] == job_id), None)

    def find(self, deck=None, slide=None, stage=None, states=LIVE):
        with self.lock:
            return [j for j in self.jobs if (deck is None or j['deck'] == deck) and (slide is None or j['slide'] == slide)
                    and (stage is None or j['stage'] == stage) and (states is None or j['state'] in states)]

    def runnable(self):
        """Work that will move by itself: pending or running, on a deck that is not paused. An open question is not."""
        with self.lock:
            return any(j['state'] in ('pending', 'running') and j['deck'] not in self.paused for j in self.jobs)

    def next(self, stage, now=None):
        now = now or time.time()
        with self.lock:
            ok = [j for j in self.jobs if j['stage'] == stage and j['state'] == 'pending' and j['deck'] not in self.paused
                  and (j.get('notBefore') or 0) <= now]
            return min(ok, key=lambda j: j['order']) if ok else None

    # ---- changing
    def add(self, deck, slide, stage, res=None, est=None, state='pending', exec_id=None):
        """Queue one job, or return the live one already there for the same slide and stage (never two)."""
        with self.lock:
            have = self.find(deck, slide, stage)
            if have: return have[0]
            now = time.time()
            old = self.find(deck, slide, stage, states=('failed', 'done'))
            if old:       # the same slide again: its row comes back to life (lastError kept until it succeeds), never a second row
                old[0].update(state=state, attempts=1 if state == 'running' else 0, notBefore=0, execId=exec_id, res=res,
                              est=est, startedAt=now if state == 'running' else None, endedAt=None,
                              order=max([x['order'] for x in self.jobs] + [0]) + 1)
                j = old[0]
                self.jobs = [x for x in self.jobs if x is j or not (x['deck'] == deck and x['slide'] == slide
                                                                  and x['stage'] == stage)]
                self.save()
                return j
            j = {'id': uuid.uuid4().hex[:10], 'deck': deck, 'slide': slide, 'stage': stage, 'state': state, 'res': res,
                 'order': max([x['order'] for x in self.jobs] + [0]) + 1, 'attempts': 1 if state == 'running' else 0,
                 'notBefore': 0, 'lastError': None, 'execId': exec_id, 'addedAt': now,
                 'startedAt': now if state == 'running' else None, 'endedAt': None, 'est': est, 'framesDone': None}
            self.jobs.append(j)
        self.save()
        return j

    def update(self, job, **fields):
        with self.lock:
            job.update(fields)
            if fields.get('state') in ('done', 'failed'): job['endedAt'] = time.time()
        self.save()
        return job

    def start(self, job):
        """Flush the job as running with its attempt ALREADY counted, before the caller launches it: a job that hard-crashes
        the whole process is then bounded at MAX_ATTEMPTS restarts instead of looping for ever."""
        return self.update(job, state='running', attempts=int(job.get('attempts') or 0) + 1, startedAt=time.time(), notBefore=0)

    def unstart(self, job, wait_s):
        """The world was busy (409, a usage limit): back to pending WITHOUT burning the attempt start() counted."""
        return self.update(job, state='pending', attempts=max(0, int(job.get('attempts') or 0) - 1), notBefore=time.time() + wait_s)

    def failed_attempt(self, job, code, reason, retry_s=60):
        """A real failure. Pending again until the attempts run out, then failed for good (kept, never deleted)."""
        err = {'code': code, 'reason': reason, 'at': time.time()}
        if int(job.get('attempts') or 0) >= MAX_ATTEMPTS: return self.update(job, state='failed', lastError=err)
        return self.update(job, state='pending', lastError=err, notBefore=time.time() + retry_s)

    def remove(self, job_id):
        with self.lock:
            n = len(self.jobs)
            self.jobs = [j for j in self.jobs if j['id'] != job_id]
            hit = len(self.jobs) != n
        if hit: self.save()
        return hit

    def move(self, job_id, step):
        """Swap a job with its neighbour (step -1 up, +1 down) among the same deck's live jobs."""
        with self.lock:
            j = self.get(job_id)
            if not j: return False
            row = sorted(self.find(j['deck'], states=LIVE), key=lambda x: x['order'])
            i = next((k for k, x in enumerate(row) if x['id'] == job_id), -1)
            k = i + (1 if step > 0 else -1)
            if i < 0 or not 0 <= k < len(row): return False
            row[i]['order'], row[k]['order'] = row[k]['order'], row[i]['order']
        self.save()
        return True

    def pause(self, deck, on):
        with self.lock:
            self.paused = [p for p in self.paused if p != deck] + ([deck] if on else [])
        self.save()

    def recover(self):
        """At startup: nothing is running any more. A running job goes back to pending with its attempt still counted - or
        to failed, when it already had its MAX_ATTEMPTS (the poison-job guard). Returns the jobs it touched."""
        hit = []
        with self.lock:
            for j in self.jobs:
                if j['state'] != 'running': continue
                if int(j.get('attempts') or 0) >= MAX_ATTEMPTS:
                    j.update(state='failed', endedAt=time.time(), lastError={'code': 'crashed', 'at': time.time(),
                             'reason': f'Lumi stopped during this job {MAX_ATTEMPTS} times, so it was not tried again.'})
                else:
                    j.update(state='pending', notBefore=0)
                hit.append(j)
        if hit: self.save()
        return hit

    def prune(self, now=None):
        now = now or time.time()
        with self.lock:
            keep = [j for j in self.jobs if not (j['state'] == 'done' and now - (j.get('endedAt') or now) > DONE_KEEP_S)]
            hit = len(keep) != len(self.jobs)
            self.jobs = keep
        if hit: self.save()
