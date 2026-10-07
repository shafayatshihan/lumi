// Lumi - the one Windows program people download (shared by a Drive link).
//
// One WinForms .exe, .NET Framework 4.x only, no admin rights, C# 5 (built by tools/build_exe.py with the csc.exe that
// ships inside Windows). It has three jobs:
//
//   install   run from anywhere except <root>\.aura\Lumi.exe: a friendly window downloads the newest release zip
//             from GitHub, unpacks it in %TEMP%, runs its setup\setup.ps1 -Json -NoLaunch hidden and turns the JSON
//             progress lines into a step list (a line with state "progress" and "pct" fills one step's own bar: that
//             is how the big pinned Blender download is shown). setup.ps1 makes the folders and shortcuts, including
//             the SHA256-verified portable Blender in .aura\blender; this program then puts a
//             copy of itself at <root>\.aura\Lumi.exe (when it is newer) and opens the app.
//   launch    the installed copy with no arguments (what the Desktop icon runs): start engine\form_server.py with a
//             working pythonw, wait for /api/ping, open Edge as an app window, exit. Problems -> "Repair Lumi".
//   --update  / --repair: the install steps again (user folders are always kept), then the app opens again.
//
// <root> is C:\Lumi. Developer overrides (environment variables):
//   AURA_ROOT          install somewhere else (setup.ps1 then puts the shortcuts inside that folder)
//   AURA_ZIP           a local zip (or another URL) instead of the GitHub release
//   AURA_SHOTS         a folder: every screen state is saved there as a PNG
//   AURA_AUTOCLICK=1   press the main button on the first screen by itself
//   AURA_AUTOCLOSE=1   close by itself after the final screen
//   AURA_EDGE_PROFILE  open Edge with this separate profile folder (so a test can close exactly that browser)
// Keep this file ASCII-only.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Lumi
{
    enum Mode { Install, AlreadyInstalled, Problem, Update, Repair }

    class FriendlyException : Exception { public FriendlyException(string m) : base(m) { } }

    // ------------------------------------------------------------------------------------------------ program
    static class Program
    {
        public const string DefaultZip =
            "https://github.com/shafayatshihan/lumi/releases/latest/download/Lumi-Setup.zip";

        [STAThread]
        static int Main(string[] args)
        {
            try { Native.SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) Theme.S = Math.Max(1f, g.DpiX / 96f);
            Paths.Init();
            Log.W("Lumi " + Program.Version() + "  self: " + Paths.Self + "  root: " + Paths.Root +
                  "  args: " + string.Join(" ", args));

            bool update = HasArg(args, "--update"), repair = HasArg(args, "--repair");
            FromApp = HasArg(args, "--from-app");   // started by the app's update button: it reloads itself, so open no new window
            if (update || repair)
            {
                // The installed copy cannot replace itself while it runs: carry on from a copy in %TEMP%.
                if (Paths.SelfIsInstalled) { RelaunchFromTemp((update ? "--update" : "--repair") + (FromApp ? " --from-app" : "")); return 0; }
                return RunInstaller(update ? Mode.Update : Mode.Repair, null);
            }
            if (Paths.SelfIsInstalled)
            {
                SplashForm splash = new SplashForm();
                Application.Run(splash);
                if (splash.Problem == null) return 0;
                Application.Run(new InstallForm(Mode.Problem, splash.Problem));
                return 1;
            }
            return RunInstaller(Paths.IsInstalled ? Mode.AlreadyInstalled : Mode.Install, null);
        }

        public static bool FromApp;
        static int RunInstaller(Mode mode, string reason)
        {
            bool fresh;
            using (Mutex m = new Mutex(true, "Lumi-Installer", out fresh))
            {
                if (!fresh)
                {
                    MessageBox.Show("Lumi is already being set up in another window.", "Lumi",
                                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 1;
                }
                Application.Run(new InstallForm(mode, reason));
                GC.KeepAlive(m);
            }
            return 0;
        }

        static bool HasArg(string[] args, string a)
        {
            foreach (string s in args) if (string.Equals(s, a, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        public static void RelaunchFromTemp(string arg)
        {
            string dir = Path.Combine(Path.GetTempPath(), "Lumi-run");
            Directory.CreateDirectory(dir);
            string copy = Path.Combine(dir, "Lumi.exe");
            File.Copy(Paths.Self, copy, true);
            ProcessStartInfo psi = new ProcessStartInfo(copy, arg);
            psi.UseShellExecute = false;
            psi.EnvironmentVariables["AURA_ROOT"] = Paths.Root;
            Process.Start(psi);
            Log.W("relaunched from " + copy + " " + arg);
        }

        public static Version Version() { return Assembly.GetExecutingAssembly().GetName().Version; }

        public static string Env(string name)
        {
            string v = Environment.GetEnvironmentVariable(name);
            return string.IsNullOrEmpty(v) ? null : v;
        }
    }

    static class Native
    {
        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int val, int size);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool DeleteFile(string p);

        public static void StyleCaption(Form f)        // Windows 11: title bar in the page colour
        {
            try
            {
                int c = ColorTranslator.ToWin32(Theme.Bg); int h1 = DwmSetWindowAttribute(f.Handle, 35, ref c, 4);
                int t = ColorTranslator.ToWin32(Theme.Ink); int h2 = DwmSetWindowAttribute(f.Handle, 36, ref t, 4);
                if (h1 != 0 || h2 != 0) Log.W("caption colour: 0x" + h1.ToString("X8") + " 0x" + h2.ToString("X8"));
            }
            catch { }
        }
        public static void RoundCorners(Form f) { try { int v = 2; DwmSetWindowAttribute(f.Handle, 33, ref v, 4); } catch { } }
        // A copied file keeps "downloaded from the internet", which would make SmartScreen ask again.
        public static void Unblock(string file) { try { DeleteFile(file + ":Zone.Identifier"); } catch { } }
    }

    // ------------------------------------------------------------------------------------------------ paths, config, log
    static class Paths
    {
        public const string DefaultRoot = @"C:\Lumi";
        public static string Self, SelfDir, Root, Aura, Engine, InstalledExe, Logs;

        public static void Init()
        {
            Self = Path.GetFullPath(Assembly.GetExecutingAssembly().Location);
            SelfDir = Path.GetDirectoryName(Self);
            string env = Program.Env("AURA_ROOT");
            if (string.Equals(Path.GetFileName(SelfDir), ".aura", StringComparison.OrdinalIgnoreCase))
                Root = Path.GetDirectoryName(SelfDir);       // the installed copy knows where it lives (even when broken)
            else if (env != null) Root = Path.GetFullPath(env).TrimEnd('\\');
            else Root = DefaultRoot;
            Aura = Path.Combine(Root, ".aura");
            Engine = Path.Combine(Aura, "engine");
            Logs = Path.Combine(Aura, "logs");
            InstalledExe = Path.Combine(Aura, "Lumi.exe");
        }
        public static bool SelfIsInstalled { get { return string.Equals(Self, InstalledExe, StringComparison.OrdinalIgnoreCase); } }
        public static bool IsInstalled
        {
            get { return File.Exists(InstalledExe) && File.Exists(Path.Combine(Engine, "form_server.py")); }
        }
        public static bool TestRoot { get { return !string.Equals(Root, DefaultRoot, StringComparison.OrdinalIgnoreCase); } }
    }

    static class Cfg
    {
        static Dictionary<string, object> Load()
        {
            try
            {
                string f = Path.Combine(Paths.Aura, "aura.config.json");
                if (File.Exists(f)) return new JavaScriptSerializer().DeserializeObject(File.ReadAllText(f)) as Dictionary<string, object>;
            }
            catch (Exception e) { Log.W("config: " + e.Message); }
            return null;
        }
        public static int Port()
        {
            Dictionary<string, object> c = Load();
            object v;
            if (c != null && c.TryGetValue("formPort", out v)) { try { return Convert.ToInt32(v, CultureInfo.InvariantCulture); } catch { } }
            return 8765;
        }
        // The port the server really bound (it moves on to the next free one when the configured port is taken): .aura/temp/port
        public static string PortFile { get { return Path.Combine(Paths.Aura, "temp", "port"); } }
        public static int ActivePort()
        {
            try
            {
                int p;
                if (File.Exists(PortFile) && int.TryParse(File.ReadAllText(PortFile).Trim(), out p) && p > 1023 && p < 65536) return p;
            }
            catch { }
            return 0;
        }
        public static string ZipUrl()
        {
            Dictionary<string, object> c = Load();
            object v;
            if (c != null && c.TryGetValue("releaseZip", out v) && v is string && ((string)v).StartsWith("http")) return (string)v;
            return Program.DefaultZip;
        }
    }

    static class Log
    {
        public static readonly string File = Path.Combine(Path.GetTempPath(),
            "Lumi_" + DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture) + ".log");
        static readonly object Lock = new object();
        public static void W(string m)
        {
            lock (Lock)
            {
                try { System.IO.File.AppendAllText(File, "[" + DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture) + "] " + m + "\r\n"); }
                catch { }
            }
        }
        public static void SaveCopy()          // keep the installer log next to setup's own logs
        {
            try
            {
                if (!Directory.Exists(Paths.Aura)) return;     // nothing installed yet: do not make the folder
                Directory.CreateDirectory(Paths.Logs);
                System.IO.File.Copy(File, Path.Combine(Paths.Logs, "app_" + Path.GetFileName(File).Substring(5)), true);
            }
            catch { }
        }
    }

    // ------------------------------------------------------------------------------------------------ theme
    static class Theme
    {
        public static readonly Color Bg = Color.FromArgb(0xEE, 0xED, 0xF9);
        public static readonly Color Ink = Color.FromArgb(0x08, 0x09, 0x09);
        public static readonly Color InkHover = Color.FromArgb(0x2C, 0x2B, 0x38);
        public static readonly Color Muted = Color.FromArgb(0x58, 0x57, 0x6E);
        public static readonly Color Soft = Color.FromArgb(0xD9, 0xD5, 0xF0);
        public static readonly Color Accent = Color.FromArgb(0x6B, 0x5B, 0xD6);
        public static readonly Color Good = Color.FromArgb(0x1E, 0x9A, 0x66);
        public static readonly Color Bad = Color.FromArgb(0xD0, 0x3A, 0x3A);
        public static readonly Color Card = Color.White;
        public static float S = 1f;
        public static int P(float v) { return (int)Math.Round(v * S); }

        static readonly Dictionary<string, Font> Fonts = new Dictionary<string, Font>();
        public static Font F(float pt) { return Get("Segoe UI", pt, FontStyle.Regular); }
        public static Font B(float pt) { return Get("Segoe UI", pt, FontStyle.Bold); }
        public static Font Semi(float pt)
        {
            Font f = Get("Segoe UI Semibold", pt, FontStyle.Regular);
            return f.Name == "Segoe UI Semibold" ? f : B(pt);
        }
        static Font Get(string face, float pt, FontStyle st)
        {
            string k = face + pt + st;
            Font f;
            if (!Fonts.TryGetValue(k, out f)) { f = new Font(face, pt, st, GraphicsUnit.Point); Fonts[k] = f; }
            return f;
        }

        public static GraphicsPath Round(RectangleF r, float rad)
        {
            GraphicsPath p = new GraphicsPath();
            float d = Math.Min(rad * 2, Math.Min(r.Width, r.Height));
            if (d <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static Image Res(string name)
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("Lumi." + name))
            {
                if (s == null) return null;
                using (Image i = Image.FromStream(s)) return new Bitmap(i);
            }
        }
        public static Icon AppIcon()
        {
            try
            {
                using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("Lumi.lumi.ico"))
                    if (s != null) return new Icon(s);
            }
            catch { }
            return null;
        }
        public static int TextHeight(string text, Font f, int width)
        {
            return TextRenderer.MeasureText(text, f, new Size(width, int.MaxValue),
                TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix).Height;
        }
    }

    // ------------------------------------------------------------------------------------------------ controls
    class PillButton : Button
    {
        public bool Primary = true;
        bool hover, down;
        public PillButton(string text, bool primary)
        {
            Text = text; Primary = primary;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand; Font = Theme.Semi(12.5f);
            Height = Theme.P(52);
            FitWidth();
        }
        public void FitWidth() { Width = TextRenderer.MeasureText(Text, Font).Width + Theme.P(64); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            float inset = Theme.S * 1.5f + (down ? Theme.S : 0);
            RectangleF r = new RectangleF(inset, inset, Width - 2 * inset - 1, Height - 2 * inset - 1);
            using (GraphicsPath p = Theme.Round(r, r.Height / 2))
            {
                if (Primary)
                    using (SolidBrush b = new SolidBrush(hover ? Theme.InkHover : Theme.Ink)) g.FillPath(b, p);
                else
                {
                    using (SolidBrush b = new SolidBrush(hover ? Color.White : Color.FromArgb(0xF8, 0xF7, 0xFE))) g.FillPath(b, p);
                    using (Pen pen = new Pen(Theme.Ink, 1.5f * Theme.S)) g.DrawPath(pen, p);
                }
                if (Focused && ShowFocusCues)
                {
                    RectangleF fr = RectangleF.Inflate(r, -3 * Theme.S, -3 * Theme.S);
                    using (GraphicsPath fp = Theme.Round(fr, fr.Height / 2))
                    using (Pen pen = new Pen(Primary ? Color.FromArgb(150, 255, 255, 255) : Theme.Accent, Theme.S)) g.DrawPath(pen, fp);
                }
            }
            TextRenderer.DrawText(g, Text, Font, new Rectangle(0, down ? 1 : 0, Width, Height), Primary ? Color.White : Theme.Ink,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine);
        }
    }

    class RoundPanel : Panel
    {
        public RoundPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            BackColor = Theme.Card;
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            RectangleF r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (GraphicsPath p = Theme.Round(r, Theme.P(18)))
            {
                using (SolidBrush b = new SolidBrush(Theme.Card)) g.FillPath(b, p);
                using (Pen pen = new Pen(Theme.Soft, Theme.S)) g.DrawPath(pen, p);
            }
        }
    }

    class ProgressBarPill : Control
    {
        double value;
        public double Value { get { return value; } set { this.value = Math.Max(0, Math.Min(1, value)); Invalidate(); } }
        public Color Fill = Theme.Accent;
        public ProgressBarPill()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
        }
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            RectangleF r = new RectangleF(0, 0, Width - 1, Height - 1);
            using (GraphicsPath p = Theme.Round(r, r.Height / 2))
            using (SolidBrush b = new SolidBrush(Theme.Soft)) g.FillPath(b, p);
            if (value > 0)
            {
                RectangleF f = new RectangleF(0, 0, Math.Max(r.Height, (float)(r.Width * value)), r.Height);
                using (GraphicsPath p = Theme.Round(f, f.Height / 2))
                using (SolidBrush b = new SolidBrush(Fill)) g.FillPath(b, p);
            }
        }
    }

    class Spinner : Control
    {
        float angle;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        public Spinner()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
            timer.Interval = 30; timer.Tick += delegate { angle = (angle + 9) % 360; Invalidate(); }; timer.Start();
        }
        protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }
        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Parent != null ? Parent.BackColor : Theme.Bg);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            float w = 3.5f * Theme.S;
            RectangleF r = new RectangleF(w, w, Width - 2 * w - 1, Height - 2 * w - 1);
            using (Pen ring = new Pen(Theme.Soft, w)) g.DrawEllipse(ring, r);
            using (Pen arc = new Pen(Theme.Accent, w)) { arc.StartCap = arc.EndCap = LineCap.Round; g.DrawArc(arc, r, angle, 100); }
        }
    }

    enum RowState { Pending, Running, Ok, Have, Fail }

    class StepRow
    {
        public string Key, Name, Detail = "";
        public RowState State = RowState.Pending;
        public DateTime Started;
        public double Fraction = -1;       // download progress 0..1, -1 = unknown
    }

    class StepList : Control
    {
        public readonly List<StepRow> Rows = new List<StepRow>();
        float angle;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        public StepList()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw, true);
            timer.Interval = 40;
            timer.Tick += delegate { angle = (angle + 12) % 360; if (Rows.Exists(r => r.State == RowState.Running)) Invalidate(); };
            timer.Start();
        }
        protected override void Dispose(bool disposing) { if (disposing) timer.Dispose(); base.Dispose(disposing); }
        public StepRow Find(string key) { return Rows.Find(r => r.Key == key); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(BackColor);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            if (Rows.Count == 0) return;
            int rowH = Math.Min(Theme.P(40), Height / Rows.Count);
            int d = Math.Min(Theme.P(24), rowH - Theme.P(6));
            Font name = Theme.F(rowH >= Theme.P(34) ? 12f : 11f), nameBold = Theme.Semi(rowH >= Theme.P(34) ? 12f : 11f);
            Font det = Theme.F(rowH >= Theme.P(34) ? 10.5f : 9.5f);
            for (int i = 0; i < Rows.Count; i++)
            {
                StepRow r = Rows[i];
                int y = i * rowH;
                RectangleF ic = new RectangleF(Theme.P(2), y + (rowH - d) / 2f, d, d);
                DrawIcon(g, r.State, ic);
                int tx = Theme.P(2) + d + Theme.P(16);
                string detail = DetailText(r);
                int detW = 0;
                if (detail.Length > 0)
                    detW = Math.Min(TextRenderer.MeasureText(detail, det).Width + Theme.P(4), (Width - tx) / 2);
                Color nc = r.State == RowState.Pending ? Theme.Muted : Theme.Ink;
                TextRenderer.DrawText(g, r.Name, r.State == RowState.Running ? nameBold : name,
                    new Rectangle(tx, y, Width - tx - detW - Theme.P(12), rowH), nc,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
                if (detW > 0)
                    TextRenderer.DrawText(g, detail, det, new Rectangle(Width - detW, y, detW, rowH),
                        r.State == RowState.Fail ? Theme.Bad : Theme.Muted,
                        TextFormatFlags.VerticalCenter | TextFormatFlags.Right | TextFormatFlags.SingleLine |
                        TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
            }
        }

        static string DetailText(StepRow r)
        {
            if (r.State != RowState.Running) return r.Detail ?? "";
            int s = (int)(DateTime.Now - r.Started).TotalSeconds;
            string t = s >= 3 ? string.Format(CultureInfo.InvariantCulture, "{0}:{1:00}", s / 60, s % 60) : "";
            if (!string.IsNullOrEmpty(r.Detail)) return t.Length > 0 ? r.Detail + "   " + t : r.Detail;
            return t;
        }

        void DrawIcon(Graphics g, RowState st, RectangleF r)
        {
            float w = Math.Max(2f, 2.4f * Theme.S);
            if (st == RowState.Pending)
            {
                RectangleF rr = RectangleF.Inflate(r, -w, -w);
                using (Pen p = new Pen(Theme.Soft, w)) g.DrawEllipse(p, rr);
                return;
            }
            if (st == RowState.Running)
            {
                RectangleF rr = RectangleF.Inflate(r, -w, -w);
                using (Pen p = new Pen(Theme.Soft, w)) g.DrawEllipse(p, rr);
                using (Pen p = new Pen(Theme.Accent, w)) { p.StartCap = p.EndCap = LineCap.Round; g.DrawArc(p, rr, angle, 110); }
                return;
            }
            Color fill = st == RowState.Ok ? Theme.Good : st == RowState.Have ? Theme.Accent : Theme.Bad;
            using (SolidBrush b = new SolidBrush(fill)) g.FillEllipse(b, r);
            using (Pen p = new Pen(Color.White, w))
            {
                p.StartCap = p.EndCap = LineCap.Round; p.LineJoin = LineJoin.Round;
                if (st == RowState.Fail)
                {
                    float a = r.Width * 0.32f;
                    g.DrawLine(p, r.X + a, r.Y + a, r.Right - a, r.Bottom - a);
                    g.DrawLine(p, r.Right - a, r.Y + a, r.X + a, r.Bottom - a);
                }
                else
                    g.DrawLines(p, new PointF[] {
                        new PointF(r.X + r.Width * 0.28f, r.Y + r.Height * 0.53f),
                        new PointF(r.X + r.Width * 0.44f, r.Y + r.Height * 0.68f),
                        new PointF(r.X + r.Width * 0.73f, r.Y + r.Height * 0.36f) });
            }
        }
    }

    // ------------------------------------------------------------------------------------------------ launch (the Desktop icon)
    static class Launcher
    {
        public static string Url(int port) { return "http://127.0.0.1:" + port + "/"; }

        public static Dictionary<string, object> Ping(string url)
        {
            try
            {
                // nothing listening: answer at once instead of paying for a full HTTP request
                // (a refused connect on Windows takes about 2 s, the listener table is instant)
                int port = new Uri(url).Port;
                bool listening = false;
                foreach (IPEndPoint ep in System.Net.NetworkInformation.IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())
                    if (ep.Port == port) { listening = true; break; }
                if (!listening) return null;
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url + "api/ping");
                req.Timeout = 2000; req.ReadWriteTimeout = 2000; req.Proxy = null;
                using (WebResponse r = req.GetResponse())
                using (StreamReader sr = new StreamReader(r.GetResponseStream()))
                {
                    Dictionary<string, object> o = new JavaScriptSerializer().DeserializeObject(sr.ReadToEnd()) as Dictionary<string, object>;
                    return o ?? new Dictionary<string, object>();
                }
            }
            catch { return null; }
        }

        // null when the app window is opening; otherwise a problem code: engine | python | server
        public static string Start(bool openWindow = true)
        {
            int port = Cfg.Port();
            int active = Cfg.ActivePort();       // W-07: the server may be on the next free port when the configured one was taken
            if (active > 0 && active != port && Ping(Url(active)) != null) port = active;
            string url = Url(port);
            Dictionary<string, object> ping = Ping(url);
            if (ping != null && !ping.ContainsKey("api")) { StopServer(port); ping = Ping(url); }   // a pre-web-app server
            if (ping == null)
            {
                string server = Path.Combine(Paths.Engine, "form_server.py");
                if (!File.Exists(server)) { Log.W("missing " + server); return "engine"; }
                string pyw = FindPythonw();
                if (pyw == null) { Log.W("no working Python"); return "python"; }
                ProcessStartInfo psi = new ProcessStartInfo(pyw, "\"" + server + "\"");
                psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.WorkingDirectory = Paths.Engine;
                try { File.Delete(Cfg.PortFile); } catch { }
                Process p = Process.Start(psi);
                Log.W("server started: pid " + p.Id + "  " + pyw + "  port " + port);
                bool up = false;
                for (int i = 0; i < 120 && !up; i++)
                {
                    Thread.Sleep(250);
                    int np = Cfg.ActivePort();
                    if (np > 0 && np != port) { port = np; url = Url(np); Log.W("server is on port " + np + " (the configured port was busy)"); }
                    if (Ping(url) != null) up = true;
                    else if (p.HasExited) { Log.W("server exited with code " + p.ExitCode); return "server"; }
                }
                if (!up) { Log.W("server did not answer in 30 s"); return "server"; }
            }
            if (openWindow) OpenWindow(url);
            return null;
        }

        // An Lumi server still running (an update replaces its files, an old one has no api version): stop it.
        public static void StopServer(int port)
        {
            string cmd = "$o = Get-NetTCPConnection -LocalPort " + port + " -State Listen -ErrorAction SilentlyContinue | " +
                "Select-Object -First 1 -ExpandProperty OwningProcess; if ($o) { $p = Get-Process -Id $o -ErrorAction SilentlyContinue; " +
                "if ($p -and $p.ProcessName -match '^(python|pythonw|py|pyw)$') { Stop-Process -Id $o -Force; 'stopped ' + $o } }";
            string outp = RunHidden(PowerShellExe(), "-NoProfile -ExecutionPolicy Bypass -Command \"" + cmd + "\"", 20000);
            Log.W("stop server on " + port + ": " + (outp ?? "").Trim());
            for (int i = 0; i < 20 && Ping(Url(port)) != null; i++) Thread.Sleep(250);
        }

        public static string PowerShellExe()
        {
            string p = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
            return File.Exists(p) ? p : "powershell.exe";
        }

        static string RunHidden(string exe, string args, int waitMs)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(exe, args);
                psi.UseShellExecute = false; psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
                using (Process p = Process.Start(psi))
                {
                    string o = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(waitMs);
                    return o;
                }
            }
            catch (Exception e) { Log.W("run " + exe + ": " + e.Message); return null; }
        }

        static bool Works(string python)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(python, "-c \"import http.server\"");
                psi.UseShellExecute = false; psi.CreateNoWindow = true;
                using (Process p = Process.Start(psi))
                {
                    if (!p.WaitForExit(20000)) { try { p.Kill(); } catch { } return false; }
                    return p.ExitCode == 0;
                }
            }
            catch { return false; }
        }

        // Aura's private Python (.aura\venv) when it still works for this account, else any real Python here.
        public static string FindPythonw()
        {
            string venvw = Path.Combine(Paths.Aura, @"venv\Scripts\pythonw.exe");
            string cfg = Path.Combine(Paths.Aura, @"venv\pyvenv.cfg");
            if (File.Exists(venvw) && File.Exists(cfg))
            {
                foreach (string line in File.ReadAllLines(cfg))
                {
                    Match m = Regex.Match(line, @"^\s*home\s*=\s*(.*)$");
                    if (m.Success)
                    {
                        if (File.Exists(Path.Combine(m.Groups[1].Value.Trim(), "python.exe"))) return venvw;
                        break;
                    }
                }
            }
            List<string> c = new List<string>();
            foreach (string bas in new string[] {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Python"),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) })
            {
                if (!Directory.Exists(bas)) continue;
                List<string> dirs = new List<string>(Directory.GetDirectories(bas, "Python3*"));
                dirs.Sort((a, b) => PyRank(b).CompareTo(PyRank(a)));        // Python313 before Python39
                foreach (string d in dirs) { string w = Path.Combine(d, "pythonw.exe"); if (File.Exists(w)) c.Add(w); }
            }
            foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
            {
                if (dir.Trim().Length == 0) continue;
                foreach (string n in new string[] { "pythonw.exe", "pyw.exe" })
                {
                    try { string w = Path.Combine(dir.Trim(), n); if (File.Exists(w)) c.Add(w); } catch { }
                }
            }
            foreach (string w in c)
            {
                if (w.IndexOf("WindowsApps", StringComparison.OrdinalIgnoreCase) >= 0) continue;   // the Store placeholder
                string exe = Regex.Replace(Regex.Replace(w, @"pythonw\.exe$", "python.exe", RegexOptions.IgnoreCase),
                                           @"pyw\.exe$", "py.exe", RegexOptions.IgnoreCase);
                if (File.Exists(exe) && Works(exe)) return w;
            }
            return null;
        }

        static int PyRank(string dir)
        {
            Match m = Regex.Match(Path.GetFileName(dir), @"^Python3(\d+)");
            return m.Success ? int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) : 0;
        }

        // An app window in Edge (no tabs or address bar) when available, otherwise the default browser.
        // Fullscreen, not maximized: maximized keeps the title bar and the taskbar, which is not what was asked for.
        // --start-fullscreen, NOT --kiosk: kiosk exists to take the ways out away (it suppresses the window controls
        // and the F11 toggle), and a person must never be shut in. With --start-fullscreen, F11 gives the window back,
        // Alt+F4 closes it, and the page shows a "close lumi" control for as long as the window has no title bar
        // (engine/form/js/shell.js). engine/form.ps1 is the same decision for the dev launch: keep the two in step.
        public static void OpenWindow(string url)
        {
            string[] edges = {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe") };
            foreach (string e in edges)
            {
                if (!File.Exists(e)) continue;
                string args = "--app=" + url + " --start-fullscreen";
                string profile = Program.Env("AURA_EDGE_PROFILE");
                if (profile != null) args += " --user-data-dir=\"" + profile + "\" --no-first-run --no-default-browser-check";
                Process p = Process.Start(e, args);
                Log.W("opened Edge: pid " + (p != null ? p.Id.ToString(CultureInfo.InvariantCulture) : "?") + "  " + args);
                return;
            }
            Process.Start(url);
            Log.W("opened the default browser: " + url);
        }

        public static string ProblemText(string code)
        {
            if (code == "python") return "Lumi could not find a working Python on this Windows account.";
            if (code == "engine") return "Some Lumi files are missing from your Lumi folder.";
            return "The small Lumi helper that runs in the background did not start.";
        }
    }

    // ------------------------------------------------------------------------------------------------ problem report
    static class Report
    {
        public static string Make()
        {
            string stamp = DateTime.Now.ToString("yyyy-MM-dd HH-mm", CultureInfo.InvariantCulture);
            string tmp = Path.Combine(Path.GetTempPath(), "aura-report-" + DateTime.Now.Ticks);
            Directory.CreateDirectory(tmp);
            try
            {
                if (Directory.Exists(Paths.Logs))
                {
                    string ld = Path.Combine(tmp, "logs"); Directory.CreateDirectory(ld);
                    foreach (string f in Directory.GetFiles(Paths.Logs)) { try { File.Copy(f, Path.Combine(ld, Path.GetFileName(f)), true); } catch { } }
                }
                try { File.Copy(Log.File, Path.Combine(tmp, Path.GetFileName(Log.File)), true); } catch { }
                string brief = Path.Combine(Paths.Aura, @"brief\brief.json");
                if (File.Exists(brief)) { try { File.Copy(brief, Path.Combine(tmp, "brief.json"), true); } catch { } }
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("Lumi report  " + DateTime.Now.ToString("u", CultureInfo.InvariantCulture));
                sb.AppendLine("App      " + Program.Version() + "  " + Paths.Self);
                sb.AppendLine("Windows  " + Environment.OSVersion.VersionString + (Environment.Is64BitOperatingSystem ? " 64-bit" : " 32-bit"));
                try { DriveInfo di = new DriveInfo(Path.GetPathRoot(Paths.Root)); sb.AppendLine("Free     " + (di.AvailableFreeSpace / 1e9).ToString("0.0", CultureInfo.InvariantCulture) + " GB on " + di.Name); } catch { }
                sb.AppendLine("Folder   " + Paths.Root + (Directory.Exists(Paths.Root) ? "" : "  (missing)"));
                foreach (string t in new string[] { "git", "node", "npm", "python", "py", "claude", "winget" })
                {
                    string w = null;
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo(Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe", "/d /c where " + t);
                        psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.RedirectStandardOutput = true;
                        using (Process p = Process.Start(psi)) { w = p.StandardOutput.ReadLine(); p.WaitForExit(5000); }
                    }
                    catch { }
                    sb.AppendLine(t.PadRight(8) + " " + (string.IsNullOrEmpty(w) ? "missing" : w));
                }
                File.WriteAllText(Path.Combine(tmp, "versions.txt"), sb.ToString());
                // a developer test install keeps the report in its own folder instead of the real Desktop
                string destDir = Paths.TestRoot && Directory.Exists(Paths.Root) ? Paths.Root
                               : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string zip = Path.Combine(destDir, "Lumi problem report " + stamp + ".zip");
                if (File.Exists(zip)) File.Delete(zip);
                ZipFile.CreateFromDirectory(tmp, zip);
                if (!Paths.TestRoot) Process.Start("explorer.exe", "/select,\"" + zip + "\"");
                return zip;
            }
            finally { try { Directory.Delete(tmp, true); } catch { } }
        }
    }

    // ------------------------------------------------------------------------------------------------ splash (launch mode)
    class SplashForm : Form
    {
        public string Problem;          // null = the app window is opening
        public SplashForm()
        {
            Text = "Lumi"; Icon = Theme.AppIcon();
            FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen;
            BackColor = Theme.Bg; ClientSize = new Size(Theme.P(420), Theme.P(330)); ShowInTaskbar = true;
            Image img = Theme.Res("character.jpg");
            PictureBox pic = new PictureBox();
            pic.Image = img; pic.SizeMode = PictureBoxSizeMode.Zoom;
            pic.Bounds = new Rectangle(Theme.P(60), Theme.P(28), Theme.P(300), Theme.P(210));
            Controls.Add(pic);
            Spinner sp = new Spinner(); sp.Bounds = new Rectangle(Theme.P(118), Theme.P(262), Theme.P(28), Theme.P(28));
            Controls.Add(sp);
            Label l = new Label();
            l.Text = "Opening Lumi..."; l.Font = Theme.Semi(14f); l.ForeColor = Theme.Ink; l.AutoSize = true;
            l.Location = new Point(Theme.P(156), Theme.P(260)); l.BackColor = Color.Transparent;
            Controls.Add(l);
        }
        protected override CreateParams CreateParams
        {
            get { CreateParams cp = base.CreateParams; cp.ClassStyle |= 0x20000; return cp; }   // drop shadow
        }
        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Native.RoundCorners(this);
            InstallForm.MaybeShot(this, "launch-splash");
            Thread t = new Thread(() =>
            {
                string problem;
                try { problem = Launcher.Start(!Program.FromApp); }
                catch (Exception ex) { Log.W("launch: " + ex); problem = "server"; }
                BeginInvoke((Action)(() =>
                {
                    Problem = problem == null ? null : Launcher.ProblemText(problem);
                    if (Problem == null)
                    {
                        System.Windows.Forms.Timer tm = new System.Windows.Forms.Timer(); tm.Interval = 1500;
                        tm.Tick += delegate { tm.Stop(); Close(); }; tm.Start();
                    }
                    else Close();
                }));
            });
            t.IsBackground = true; t.Start();
        }
    }

    // ------------------------------------------------------------------------------------------------ the installer window
    class InstallForm : Form
    {
        readonly Mode mode;
        readonly string reason;
        readonly Panel welcome = new Panel(), progress = new Panel();
        // first screen
        PictureBox wPic, wLogo, pLogo;
        Label wBrand, wTitle, wBody, cardHead, cardText, pTitle, pSub, pPct;
        RoundPanel card;
        PillButton wMain, wSecond;
        // progress screen
        ProgressBarPill bar;
        StepList steps;
        PillButton pMain, pSecond, pThird;
        // work
        Process setupProc;
        volatile bool running;
        bool zipReady, done;
        string zipFile, firstFail, workDir;
        int shotN;
        bool showCard, showMain, showSecond, showThird;

        public InstallForm(Mode mode, string reason)
        {
            this.mode = mode; this.reason = reason;
            Text = "Lumi"; Icon = Theme.AppIcon();
            FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen; BackColor = Theme.Bg; Font = Theme.F(11f);
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            ClientSize = new Size(Math.Min(Theme.P(820), wa.Width - Theme.P(24)), Math.Min(Theme.P(660), wa.Height - Theme.P(56)));
            foreach (Panel p in new Panel[] { welcome, progress }) { p.Dock = DockStyle.Fill; p.BackColor = Theme.Bg; Controls.Add(p); }
            BuildWelcome();
            BuildProgress();
            progress.Visible = false;
            ApplyWelcomeText();
            LayoutWelcome();
            LayoutProgress();
        }

        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); Native.StyleCaption(this); }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            Native.StyleCaption(this);
            Activate();
            if (mode == Mode.Update || mode == Mode.Repair) { StartRun(); return; }
            Shot("welcome-" + mode.ToString().ToLowerInvariant());
            if (Program.Env("AURA_AUTOCLICK") == "1")
            {
                System.Windows.Forms.Timer t = new System.Windows.Forms.Timer(); t.Interval = 2500;
                t.Tick += delegate { t.Stop(); wMain.PerformClick(); }; t.Start();
            }
        }

        // ---------------------------------------------------------------- building
        static Label NewLabel(Control parent, Font f, Color c)
        {
            Label l = new Label(); l.Font = f; l.ForeColor = c; l.BackColor = Color.Transparent; l.AutoSize = false;
            l.UseMnemonic = false; parent.Controls.Add(l); return l;
        }

        void BuildWelcome()
        {
            Image logo = Theme.Res("lumi.png");
            wLogo = new PictureBox(); wLogo.Image = logo; wLogo.SizeMode = PictureBoxSizeMode.Zoom; welcome.Controls.Add(wLogo);
            wBrand = NewLabel(welcome, Theme.Semi(11.5f), Theme.Ink); wBrand.Text = "Lumi by Shafayat";
            wPic = new PictureBox(); wPic.Image = Theme.Res("character.jpg"); wPic.SizeMode = PictureBoxSizeMode.Zoom; welcome.Controls.Add(wPic);
            wTitle = NewLabel(welcome, Theme.B(24f), Theme.Ink); wTitle.TextAlign = ContentAlignment.MiddleCenter;
            wBody = NewLabel(welcome, Theme.F(13f), Theme.Ink); wBody.TextAlign = ContentAlignment.TopCenter;
            card = new RoundPanel(); welcome.Controls.Add(card);
            cardHead = NewLabel(card, Theme.Semi(11.5f), Theme.Ink); cardHead.BackColor = Theme.Card;
            cardText = NewLabel(card, Theme.F(11f), Theme.Muted); cardText.BackColor = Theme.Card;
            wMain = new PillButton("Install Lumi", true); welcome.Controls.Add(wMain);
            wSecond = new PillButton("Not now", false); welcome.Controls.Add(wSecond);
            wMain.Click += delegate { OnWelcomeMain(); };
            wSecond.Click += delegate { OnWelcomeSecond(); };
            AcceptButton = wMain;
        }

        void ApplyWelcomeText()
        {
            showCard = true;
            cardHead.Text = "Did Windows show a blue box saying \u201CWindows protected your PC\u201D?";
            cardText.Text = "That is normal for a free app that is not sold in a shop. Click \u201CMore info\u201D, then " +
                            "\u201CRun anyway\u201D. While Lumi installs, Windows may also ask \u201CDo you want to allow " +
                            "this app to make changes?\u201D - click Yes.";
            if (mode == Mode.AlreadyInstalled)
            {
                wTitle.Text = "Lumi is already on this PC";
                wBody.Text = "Open it now, or install it again to get the newest version. Installing again keeps your files and slides.";
                wMain.Text = "Open Lumi"; wSecond.Text = "Install again";
                showCard = false;
            }
            else if (mode == Mode.Problem)
            {
                wTitle.Text = "Lumi could not start";
                wBody.Text = (reason ?? "Something is not right.") + " \u201CRepair Lumi\u201D puts it right in a few minutes. " +
                             "Your files and slides stay where they are.";
                wMain.Text = "Repair Lumi"; wSecond.Text = "Send problem report";
                showCard = false;
            }
            else
            {
                wTitle.Text = "Let\u2019s set up Lumi";
                wBody.Text = "It is free. Lumi makes a folder for your files and slides on your C: drive and adds the free " +
                             "tools it needs: Git, Node.js, Python, Claude Code and Blender (free software, GNU GPL - its " +
                             "licence and a link to its source are installed with it). It takes 15 to 25 minutes, mostly " +
                             "downloading. Any Claude plan works; Pro or higher is recommended.";
                wMain.Text = "Install Lumi"; wSecond.Text = "Not now";
            }
            wMain.FitWidth(); wSecond.FitWidth();
            card.Visible = showCard;
        }

        void LayoutWelcome()
        {
            int W = welcome.ClientSize.Width, H = welcome.ClientSize.Height, m = Theme.P(48);
            int topY = Theme.P(22);
            wLogo.Bounds = new Rectangle(m - Theme.P(6), topY, Theme.P(34), Theme.P(34));
            wBrand.Bounds = new Rectangle(wLogo.Right + Theme.P(10), topY, Theme.P(300), Theme.P(34));
            wBrand.TextAlign = ContentAlignment.MiddleLeft;

            int btnY = H - Theme.P(26) - wMain.Height;
            int gap = Theme.P(14);
            int bw = wMain.Width + gap + wSecond.Width;
            wMain.Location = new Point((W - bw) / 2, btnY);
            wSecond.Location = new Point(wMain.Right + gap, btnY);

            int y = btnY - Theme.P(22);
            if (showCard)
            {
                int cw = W - 2 * m, pad = Theme.P(18);
                int hh = Theme.TextHeight(cardHead.Text, cardHead.Font, cw - 2 * pad);
                int th = Theme.TextHeight(cardText.Text, cardText.Font, cw - 2 * pad);
                int ch = pad + hh + Theme.P(4) + th + pad;
                card.Bounds = new Rectangle(m, y - ch, cw, ch);
                cardHead.Bounds = new Rectangle(pad, pad, cw - 2 * pad, hh);
                cardText.Bounds = new Rectangle(pad, pad + hh + Theme.P(4), cw - 2 * pad, th);
                y = card.Top - Theme.P(18);
            }
            int bodyW = W - 2 * m - Theme.P(40);
            int bh = Theme.TextHeight(wBody.Text, wBody.Font, bodyW);
            wBody.Bounds = new Rectangle((W - bodyW) / 2, y - bh, bodyW, bh);
            int tH = Theme.P(50);
            wTitle.Bounds = new Rectangle(m, wBody.Top - Theme.P(6) - tH, W - 2 * m, tH);
            int picTop = topY + Theme.P(40), picBottom = wTitle.Top - Theme.P(4);
            int ph = Math.Min(Theme.P(230), picBottom - picTop);
            wPic.Visible = ph >= Theme.P(90);
            int pw = ph * 402 / 282;
            wPic.Bounds = new Rectangle((W - pw) / 2, picBottom - ph, pw, ph);
            // short screens (no card) leave room above the picture: centre the whole block instead
            int lift = (picBottom - picTop - ph) / 2;
            if (lift > 0)
                foreach (Control c in new Control[] { wPic, wTitle, wBody, card, wMain, wSecond })
                    c.Top -= lift;
        }

        void BuildProgress()
        {
            pLogo = new PictureBox(); pLogo.Image = Theme.Res("lumi.png"); pLogo.SizeMode = PictureBoxSizeMode.Zoom; progress.Controls.Add(pLogo);
            pTitle = NewLabel(progress, Theme.B(20f), Theme.Ink);
            pSub = NewLabel(progress, Theme.F(11.5f), Theme.Muted);
            pPct = NewLabel(progress, Theme.Semi(11f), Theme.Ink); pPct.TextAlign = ContentAlignment.MiddleRight;
            bar = new ProgressBarPill(); progress.Controls.Add(bar);
            steps = new StepList(); steps.BackColor = Theme.Bg; progress.Controls.Add(steps);
            pMain = new PillButton("Try again", true); progress.Controls.Add(pMain);
            pSecond = new PillButton("Send problem report", false); progress.Controls.Add(pSecond);
            pThird = new PillButton("Close", false); progress.Controls.Add(pThird);
            pMain.Click += delegate { OnProgressMain(); };
            pSecond.Click += delegate { SendReport(); };
            pThird.Click += delegate { Close(); };
            SetButtons(false, false, false);
        }

        void LayoutProgress()
        {
            int W = progress.ClientSize.Width, H = progress.ClientSize.Height, m = Theme.P(48);
            pLogo.Bounds = new Rectangle(m - Theme.P(4), Theme.P(26), Theme.P(56), Theme.P(56));
            int tx = pLogo.Right + Theme.P(16);
            pTitle.Bounds = new Rectangle(tx, Theme.P(20), W - tx - m, Theme.P(40));
            int sh = Math.Max(Theme.P(22), Theme.TextHeight(pSub.Text ?? "", pSub.Font, W - tx - m));
            pSub.Bounds = new Rectangle(tx, pTitle.Bottom, W - tx - m, sh);
            int barY = Math.Max(pSub.Bottom, pLogo.Bottom) + Theme.P(20);
            int pctW = Theme.P(56);
            bar.Bounds = new Rectangle(m, barY, W - 2 * m - pctW - Theme.P(10), Theme.P(12));
            pPct.Bounds = new Rectangle(bar.Right + Theme.P(6), barY - Theme.P(8), pctW + Theme.P(4), Theme.P(28));
            int btnY = H - Theme.P(24) - pMain.Height;
            int x = W - m;
            bool[] vis = { showThird, showSecond, showMain };
            PillButton[] bs = { pThird, pSecond, pMain };
            for (int i = 0; i < bs.Length; i++)
            {
                PillButton b = bs[i];
                if (!vis[i]) continue;
                b.FitWidth(); x -= b.Width; b.Location = new Point(x, btnY); x -= Theme.P(12);
            }
            int listTop = barY + Theme.P(30);
            int listBottom = (showMain || showSecond || showThird) ? btnY - Theme.P(14) : H - Theme.P(24);
            steps.Bounds = new Rectangle(m, listTop, W - 2 * m, listBottom - listTop);
            steps.Invalidate();
        }

        void SetButtons(bool main, bool second, bool third)
        {
            showMain = main; showSecond = second; showThird = third;
            pMain.Visible = main; pSecond.Visible = second; pThird.Visible = third;
            if (main) AcceptButton = pMain;
        }

        void SetHeader(string title, string sub)
        {
            pTitle.Text = title; pSub.Text = sub; LayoutProgress();
        }

        // ---------------------------------------------------------------- buttons
        void OnWelcomeMain()
        {
            if (mode == Mode.AlreadyInstalled)
            {
                try { Process.Start(Paths.InstalledExe); } catch (Exception e) { Log.W("open: " + e.Message); }
                Close(); return;
            }
            if (mode == Mode.Problem && Paths.SelfIsInstalled)
            {
                try { Program.RelaunchFromTemp("--repair"); Close(); }
                catch (Exception e) { Log.W("repair relaunch: " + e); StartRun(); }
                return;
            }
            StartRun();
        }

        void OnWelcomeSecond()
        {
            if (mode == Mode.AlreadyInstalled) { StartRun(); return; }
            if (mode == Mode.Problem) { SendReport(); return; }
            Close();
        }

        void OnProgressMain()
        {
            if (done) { LaunchApp(); return; }
            StartRun();
        }

        void SendReport()
        {
            try
            {
                string zip = Report.Make();
                MessageBox.Show(this, "A problem report was saved:\n\n" + zip + "\n\nPlease send this file to Shafayat.",
                                "Lumi", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception e)
            {
                Log.W("report: " + e);
                MessageBox.Show(this, "The problem report could not be made: " + e.Message, "Lumi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (running && e.CloseReason == CloseReason.UserClosing)
            {
                DialogResult r = MessageBox.Show(this, "Lumi is still being set up. Stop now?\n\nYou can run it again later - it carries on where it stopped.",
                                                 "Lumi", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
                if (r != DialogResult.Yes) { e.Cancel = true; return; }
                KillSetup();
            }
            base.OnFormClosing(e);
        }

        void KillSetup()
        {
            Process p = setupProc;
            if (p == null) return;
            try
            {
                if (!p.HasExited)
                {
                    ProcessStartInfo psi = new ProcessStartInfo("taskkill.exe", "/T /F /PID " + p.Id);
                    psi.UseShellExecute = false; psi.CreateNoWindow = true;
                    Process.Start(psi).WaitForExit(10000);
                    Log.W("stopped setup (pid " + p.Id + ")");
                }
            }
            catch (Exception e) { Log.W("kill: " + e.Message); }
        }

        // ---------------------------------------------------------------- the run
        void UI(Action a)
        {
            if (IsDisposed) return;
            try { BeginInvoke(a); } catch (Exception) { }
        }

        string Verb() { return mode == Mode.Update ? "Updating" : mode == Mode.Repair || mode == Mode.Problem ? "Repairing" : "Setting up"; }

        void StartRun()
        {
            welcome.Visible = false; progress.Visible = true;
            done = false; firstFail = null;
            steps.Rows.Clear();
            AddRow("dl", "Download Lumi");
            AddRow("unzip", "Unpack it");
            AddRow("fin", "Finishing up");
            bar.Fill = Theme.Accent; bar.Value = 0; pPct.Text = "0%";
            SetButtons(false, false, false);
            SetHeader(Verb() + " Lumi",
                "This takes 15 to 25 minutes and you can keep using your PC. If Windows asks \u201CDo you want to allow this " +
                "app to make changes?\u201D, click Yes.");
            running = true;
            Thread t = new Thread(RunAll); t.IsBackground = true; t.Start();
        }

        StepRow AddRow(string key, string name)
        {
            StepRow r = new StepRow(); r.Key = key; r.Name = name; steps.Rows.Add(r); return r;
        }

        void SetRow(string key, RowState st, string detail)
        {
            UI(() =>
            {
                StepRow r = steps.Find(key);
                if (r == null) return;
                if (st == RowState.Running && r.State != RowState.Running) r.Started = DateTime.Now;
                r.State = st;
                if (detail != null) r.Detail = detail;
                UpdateOverall();
                steps.Invalidate();
            });
        }

        void UpdateOverall()
        {
            double sum = 0;
            foreach (StepRow r in steps.Rows)
            {
                if (r.State == RowState.Ok || r.State == RowState.Have || r.State == RowState.Fail) sum += 1;
                else if (r.State == RowState.Running) sum += r.Fraction >= 0 ? r.Fraction : 0.35;
            }
            int total = steps.Rows.Count;
            if (steps.Find("s1") == null) total += 9;             // setup's own steps are not listed yet
            double v = total > 0 ? sum / total : 0;
            bar.Value = v;
            pPct.Text = ((int)Math.Round(v * 100)).ToString(CultureInfo.InvariantCulture) + "%";
        }

        void RunAll()
        {
            string fail = null;
            try
            {
                if (Paths.IsInstalled)
                {
                    int port = Cfg.Port();
                    if (Launcher.Ping(Launcher.Url(port)) != null) Launcher.StopServer(port);   // its files are about to change
                }
                Download();
                string setup = Unpack();
                fail = RunSetup(setup);
                if (fail == null) Finish();
            }
            catch (FriendlyException e) { fail = e.Message; }
            catch (Exception e) { Log.W("unexpected: " + e); fail = "Something unexpected went wrong (" + e.Message + ")."; }
            if (fail != null) Log.W("FAILED: " + fail);
            Log.SaveCopy();
            UI(() => { running = false; if (fail == null) ShowDone(); else ShowFailed(fail); });
        }

        void Download()
        {
            SetRow("dl", RowState.Running, "");
            string dir = Path.Combine(Path.GetTempPath(), "Lumi-setup");
            Directory.CreateDirectory(dir);
            if (zipReady && File.Exists(zipFile)) { SetRow("dl", RowState.Ok, "already downloaded"); return; }
            zipFile = Path.Combine(dir, "Lumi-Setup.zip");
            string src = Program.Env("AURA_ZIP") ?? Cfg.ZipUrl();
            Log.W("download from " + src);
            if (!src.StartsWith("http", StringComparison.OrdinalIgnoreCase) && !File.Exists(src))
            {
                SetRow("dl", RowState.Fail, "test zip missing");
                throw new FriendlyException("The test zip set in AURA_ZIP was not found (" + src + ").");
            }
            Exception last = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    if (File.Exists(src)) CopyWithProgress(src, zipFile);
                    else HttpWithProgress(src, zipFile);
                    CheckZip(zipFile);
                    zipReady = true;
                    long len = new FileInfo(zipFile).Length;
                    SetRow("dl", RowState.Ok, (len / 1e6).ToString("0.0", CultureInfo.InvariantCulture) + " MB" +
                           (File.Exists(src) ? " (local test file)" : ""));
                    return;
                }
                catch (FriendlyException) { throw; }
                catch (Exception e) { last = e; Log.W("download attempt " + attempt + ": " + e.Message); Thread.Sleep(1500 * attempt); }
            }
            SetRow("dl", RowState.Fail, "no connection");
            throw new FriendlyException("Lumi could not be downloaded. Check that this PC is connected to the internet.");
        }

        void Progress(long got, long len)
        {
            UI(() =>
            {
                StepRow r = steps.Find("dl");
                if (r == null) return;
                r.Fraction = len > 0 ? (double)got / len : -1;
                r.Detail = len > 0
                    ? string.Format(CultureInfo.InvariantCulture, "{0:0.0} of {1:0.0} MB", got / 1e6, len / 1e6)
                    : string.Format(CultureInfo.InvariantCulture, "{0:0.0} MB", got / 1e6);
                UpdateOverall();
                steps.Invalidate();
            });
        }

        void HttpWithProgress(string url, string file)
        {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768;   // TLS 1.2 / 1.1
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "Lumi/" + Program.Version();
            req.Timeout = 30000; req.ReadWriteTimeout = 60000; req.AllowAutoRedirect = true;
            using (WebResponse resp = req.GetResponse())
            using (Stream s = resp.GetResponseStream())
            using (FileStream f = File.Create(file))
                Pump(s, f, resp.ContentLength);
        }

        void CopyWithProgress(string src, string file)
        {
            if (string.Equals(Path.GetFullPath(src), Path.GetFullPath(file), StringComparison.OrdinalIgnoreCase)) return;
            using (FileStream s = File.OpenRead(src))
            using (FileStream f = File.Create(file))
                Pump(s, f, s.Length);
        }

        void Pump(Stream s, Stream f, long len)
        {
            byte[] buf = new byte[81920];
            long got = 0; int n; DateTime last = DateTime.MinValue;
            while ((n = s.Read(buf, 0, buf.Length)) > 0)
            {
                f.Write(buf, 0, n); got += n;
                if ((DateTime.Now - last).TotalMilliseconds > 120) { last = DateTime.Now; Progress(got, len); }
            }
            Progress(got, len);
        }

        static void CheckZip(string file)
        {
            try
            {
                using (ZipArchive z = ZipFile.OpenRead(file))
                    foreach (ZipArchiveEntry e in z.Entries)
                        if (e.FullName.Replace('\\', '/').EndsWith("setup/setup.ps1", StringComparison.OrdinalIgnoreCase)) return;
            }
            catch (InvalidDataException) { }
            throw new FriendlyException("The download was damaged.");
        }

        string Unpack()
        {
            SetRow("unzip", RowState.Running, "");
            workDir = Path.Combine(Path.GetTempPath(), "Lumi-setup", "files");
            try
            {
                if (Directory.Exists(workDir)) Directory.Delete(workDir, true);
                ZipFile.ExtractToDirectory(zipFile, workDir);
            }
            catch (Exception e)
            {
                Log.W("unpack: " + e);
                zipReady = false;
                SetRow("unzip", RowState.Fail, "could not unpack");
                throw new FriendlyException("The download could not be unpacked (" + e.Message + ").");
            }
            foreach (string f in Directory.GetFiles(workDir, "setup.ps1", SearchOption.AllDirectories))
                if (string.Equals(Path.GetFileName(Path.GetDirectoryName(f)), "setup", StringComparison.OrdinalIgnoreCase))
                {
                    SetRow("unzip", RowState.Ok, "");
                    return f;
                }
            SetRow("unzip", RowState.Fail, "setup missing");
            throw new FriendlyException("The download did not contain the Lumi setup.");
        }

        string RunSetup(string setup)
        {
            ProcessStartInfo psi = new ProcessStartInfo(Launcher.PowerShellExe(),
                "-NoProfile -ExecutionPolicy Bypass -File \"" + setup + "\" -Json -NoLaunch");
            psi.UseShellExecute = false; psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true; psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8; psi.StandardErrorEncoding = Encoding.UTF8;
            psi.WorkingDirectory = Path.GetDirectoryName(setup);
            psi.EnvironmentVariables["AURA_ROOT"] = Paths.Root;
            psi.EnvironmentVariables["AURA_EXE"] = Paths.Self;
            Log.W("setup: " + psi.FileName + " " + psi.Arguments);
            Process p;
            try { p = Process.Start(psi); }
            catch (Exception e)
            {
                Log.W("powershell: " + e);
                throw new FriendlyException("Windows PowerShell could not start on this PC, so Lumi cannot be set up.");
            }
            setupProc = p;
            StringBuilder err = new StringBuilder();
            p.OutputDataReceived += (s, e) => { if (e.Data != null) OnSetupLine(e.Data); };
            p.ErrorDataReceived += (s, e) => { if (e.Data != null) { Log.W("setup! " + e.Data); lock (err) err.AppendLine(e.Data); } };
            p.BeginOutputReadLine(); p.BeginErrorReadLine();
            p.WaitForExit();
            int code = p.ExitCode;
            Log.W("setup exit " + code);
            setupProc = null;
            // a step that started but never reported back did not finish
            ManualResetEvent sync = new ManualResetEvent(false);
            UI(() =>
            {
                foreach (StepRow r in steps.Rows)
                    if (r.Key.StartsWith("s") && r.State == RowState.Running) { r.State = RowState.Fail; r.Detail = "stopped"; }
                steps.Invalidate(); sync.Set();
            });
            sync.WaitOne(3000);
            if (firstFail != null) return firstFail;
            if (code != 0)
            {
                string e2; lock (err) e2 = err.ToString().Trim();
                return "The setup stopped unexpectedly (code " + code + ")." +
                       (e2.Length > 0 ? " " + FirstLine(e2) : "");
            }
            return null;
        }

        static string FirstLine(string s)
        {
            int i = s.IndexOf('\n');
            s = i >= 0 ? s.Substring(0, i) : s;
            return s.Length > 160 ? s.Substring(0, 160) + "..." : s.Trim();
        }

        void OnSetupLine(string line)
        {
            Log.W("setup> " + line);
            string t = line.Trim();
            if (!t.StartsWith("{")) return;
            Dictionary<string, object> o;
            try { o = new JavaScriptSerializer().DeserializeObject(t) as Dictionary<string, object>; }
            catch { return; }
            if (o == null || !o.ContainsKey("state")) return;
            int step = 0;
            try { step = Convert.ToInt32(o["step"], CultureInfo.InvariantCulture); } catch { }
            string name = o.ContainsKey("name") ? Convert.ToString(o["name"], CultureInfo.InvariantCulture) : "";
            string state = Convert.ToString(o["state"], CultureInfo.InvariantCulture);
            string detail = o.ContainsKey("detail") ? Convert.ToString(o["detail"], CultureInfo.InvariantCulture) ?? "" : "";
            int pct = -1;
            if (o.ContainsKey("pct")) { try { pct = Convert.ToInt32(o["pct"], CultureInfo.InvariantCulture); } catch { } }
            UI(() => ApplyEvent(step, name, state, detail, pct));
        }

        void ApplyEvent(int step, string name, string state, string detail, int pct)
        {
            if (state == "plan")
            {
                int at = steps.Rows.FindIndex(r => r.Key == "fin");
                if (at < 0) at = steps.Rows.Count;
                List<StepRow> add = new List<StepRow>();
                if (steps.Find("s0") == null) { StepRow c = new StepRow(); c.Key = "s0"; c.Name = "Check this PC"; add.Add(c); }
                string[] names = detail.Split('|');
                for (int i = 0; i < names.Length; i++)
                {
                    if (steps.Find("s" + (i + 1)) != null) continue;
                    StepRow r = new StepRow(); r.Key = "s" + (i + 1); r.Name = names[i]; add.Add(r);
                }
                steps.Rows.InsertRange(at, add);
                UpdateOverall(); steps.Invalidate();
                return;
            }
            string key = "s" + step;
            StepRow row = steps.Find(key);
            if (row == null)
            {
                row = new StepRow(); row.Key = key; row.Name = step == 0 ? "Check this PC" : name;
                int at = steps.Rows.FindIndex(r => r.Key == "fin");
                steps.Rows.Insert(at < 0 ? steps.Rows.Count : at, row);
            }
            if (state == "progress")
            {
                // a long download inside one step (the Blender zip): fill that row's own little bar
                row.State = RowState.Running;
                if (row.Started == default(DateTime)) row.Started = DateTime.Now;
                row.Fraction = pct >= 0 ? Math.Min(1.0, pct / 100.0) : -1;
                row.Detail = detail;
                UpdateOverall(); steps.Invalidate();
                return;
            }
            if (state == "start") { row.State = RowState.Running; row.Started = DateTime.Now; row.Detail = ""; row.Fraction = -1; Shot("progress-step" + step); }
            else if (state == "ok") { row.State = RowState.Ok; row.Fraction = -1; row.Detail = Friendly(detail); }
            else if (state == "have") { row.State = RowState.Have; row.Detail = "already on this PC"; }
            else if (state == "fail")
            {
                row.State = RowState.Fail; row.Detail = "did not work";
                if (firstFail == null) firstFail = detail.Length > 0 ? detail : row.Name + " did not work.";
            }
            UpdateOverall(); steps.Invalidate();
        }

        static string Friendly(string d)
        {
            if (string.IsNullOrEmpty(d)) return "done";
            if (d.StartsWith("created ")) return "made";
            if (d.StartsWith("already there")) return "your files are untouched";
            return d;
        }

        void Finish()
        {
            SetRow("fin", RowState.Running, "");
            // setup.ps1 already put this release's Lumi.exe in place; a newer copy (this one) replaces it.
            try
            {
                Version mine = Program.Version(), theirs = null;
                if (File.Exists(Paths.InstalledExe))
                {
                    try { theirs = new Version(FileVersionInfo.GetVersionInfo(Paths.InstalledExe).FileVersion); } catch { }
                }
                if (!Paths.SelfIsInstalled && (theirs == null || mine > theirs))
                {
                    Directory.CreateDirectory(Paths.Aura);
                    File.Copy(Paths.Self, Paths.InstalledExe, true);
                    Log.W("installed this copy (" + mine + ") over " + (theirs == null ? "nothing" : theirs.ToString()));
                }
                Native.Unblock(Paths.InstalledExe);
            }
            catch (Exception e) { Log.W("copy self: " + e.Message); }
            if (!File.Exists(Paths.InstalledExe))
            {
                SetRow("fin", RowState.Fail, "app missing");
                throw new FriendlyException("The Lumi app could not be copied into your Lumi folder.");
            }
            SetRow("fin", RowState.Ok, "Desktop icon ready");
        }

        void ShowFailed(string message)
        {
            bar.Fill = Theme.Bad;
            SetButtons(true, true, true);
            pMain.Text = "Try again";
            SetHeader("Something did not work",
                message + " Click Try again - it carries on where it stopped. Still stuck? Click Send problem report and send the file to Shafayat.");
            Shot("failed");
            AutoClose();
        }

        void ShowDone()
        {
            done = true;
            bar.Value = 1; bar.Fill = Theme.Good; pPct.Text = "100%";
            SetButtons(false, false, false);
            SetHeader(mode == Mode.Update ? "Lumi is up to date" : "Lumi is ready",
                "Opening it now. Next time, double-click the Lumi icon on your Desktop.");
            Shot("done");
            LaunchApp();
        }

        void LaunchApp()
        {
            SetButtons(false, false, false); LayoutProgress();
            Thread t = new Thread(() =>
            {
                string problem;
                try { problem = Launcher.Start(); }
                catch (Exception e) { Log.W("launch: " + e); problem = "server"; }
                Log.SaveCopy();
                UI(() =>
                {
                    if (problem == null)
                    {
                        System.Windows.Forms.Timer tm = new System.Windows.Forms.Timer(); tm.Interval = 2500;
                        tm.Tick += delegate { tm.Stop(); Close(); }; tm.Start();
                        return;
                    }
                    pMain.Text = "Try opening again";
                    SetButtons(true, true, true);
                    SetHeader("Lumi is installed, but did not open", Launcher.ProblemText(problem) +
                              " Click Try opening again. If it still does not open, click Send problem report.");
                    Shot("launch-failed");
                    AutoClose();
                });
            });
            t.IsBackground = true; t.Start();
        }

        void AutoClose()
        {
            if (Program.Env("AURA_AUTOCLOSE") != "1") return;
            System.Windows.Forms.Timer tm = new System.Windows.Forms.Timer(); tm.Interval = 4000;
            tm.Tick += delegate { tm.Stop(); Close(); }; tm.Start();
        }

        // ---------------------------------------------------------------- screenshots for tests (AURA_SHOTS)
        void Shot(string name) { shotN++; MaybeShot(this, shotN.ToString("00", CultureInfo.InvariantCulture) + "-" + name); }

        public static void MaybeShot(Form f, string name)
        {
            string dir = Program.Env("AURA_SHOTS");
            if (dir == null) return;
            System.Windows.Forms.Timer tm = new System.Windows.Forms.Timer(); tm.Interval = 700;
            tm.Tick += delegate
            {
                tm.Stop();
                try
                {
                    if (f.IsDisposed) return;
                    Directory.CreateDirectory(dir);
                    bool top = f.TopMost; f.TopMost = true; f.Refresh();
                    Rectangle b = f.Bounds;
                    using (Bitmap bmp = new Bitmap(b.Width, b.Height))
                    {
                        using (Graphics g = Graphics.FromImage(bmp)) g.CopyFromScreen(b.Location, Point.Empty, b.Size);
                        bmp.Save(Path.Combine(dir, name + ".png"), System.Drawing.Imaging.ImageFormat.Png);
                    }
                    f.TopMost = top;
                }
                catch (Exception e) { Log.W("shot: " + e.Message); }
            };
            tm.Start();
        }
    }
}
