using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
#if TAH_ADMIN
        Application.Run(new Portal("TAH Admin Live", "/admin/", "Admin"));
#else
        Application.Run(new Portal("TAH Student Live", "/", "Student"));
#endif
    }
}

sealed class Portal : Form
{
    const string Host = "tah-private-mentorship.vercel.app";

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);

    public Portal(string title, string path, string profile)
    {
        Text = title;
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Width = 1120;
        Height = 800;
        var web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);
        var menu = new MenuStrip();
        var updateItem = new ToolStripMenuItem("Check for updates");
        updateItem.Click += async (_, _) => await PortalUpdates.CheckAsync(this, profile, true);
        menu.Items.Add(updateItem);
        Controls.Add(menu);
        MainMenuStrip = menu;
        Shown += async (_, _) =>
        {
            _ = PortalUpdates.CheckAsync(this, profile);
            if (!SetWindowDisplayAffinity(Handle, 0x11))
                Text = title + " (capture protection unavailable)";
            try
            {
                var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "The Apex House", "Live", profile);
                await web.EnsureCoreWebView2Async(await CoreWebView2Environment.CreateAsync(userDataFolder: folder));
                var core = web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = false;
                core.NavigationStarting += (_, e) =>
                    e.Cancel = !Uri.TryCreate(e.Uri, UriKind.Absolute, out Uri? url) ||
                        url.Scheme != Uri.UriSchemeHttps || url.Host != Host;
                core.NewWindowRequested += (_, e) => e.Handled = true;
                core.Navigate("https://" + Host + path);
            }
            catch
            {
                MessageBox.Show(this, "The portal requires the Microsoft Edge WebView2 Runtime.", title);
            }
        };
    }
}
