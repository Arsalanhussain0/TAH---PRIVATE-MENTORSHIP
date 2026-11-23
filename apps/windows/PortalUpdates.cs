using System.Diagnostics;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

static class PortalUpdates
{
    const string Repository = "Arsalanhussain0/TAH---PRIVATE-MENTORSHIP";
    const string TagPrefix = "tah-windows-v";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(3) };

    static int checking;

    public static async Task CheckAsync(Form window, string profile, bool manual = false)
    {
        if (Interlocked.Exchange(ref checking, 1) != 0) return;
        string? temporary = null;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                $"https://api.github.com/repos/{Repository}/releases/latest");
            request.Headers.UserAgent.ParseAdd("TAH-Windows-Updater/1.0");
            request.Headers.Accept.ParseAdd("application/vnd.github+json");
            using var release = await Http.SendAsync(request);
            release.EnsureSuccessStatusCode();
            using var json = JsonDocument.Parse(await release.Content.ReadAsStreamAsync());
            var root = json.RootElement;
            var tag = root.GetProperty("tag_name").GetString() ?? "";
            if (!tag.StartsWith(TagPrefix, StringComparison.Ordinal) ||
                !Version.TryParse(tag[TagPrefix.Length..], out var available) ||
                available <= Assembly.GetExecutingAssembly().GetName().Version ||
                root.GetProperty("draft").GetBoolean() || root.GetProperty("prerelease").GetBoolean())
            {
                if (manual && !window.IsDisposed) MessageBox.Show(window, "No newer TAH version is available.", "TAH update");
                return;
            }

            var name = $"TAH-{profile}-Windows-Live-Setup.exe";
            var asset = root.GetProperty("assets").EnumerateArray()
                .FirstOrDefault(a => a.GetProperty("name").GetString() == name);
            if (asset.ValueKind != JsonValueKind.Object ||
                !asset.TryGetProperty("digest", out var digestProperty)) return;
            var digest = digestProperty.GetString() ?? "";
            var size = asset.GetProperty("size").GetInt64();
            if (!Regex.IsMatch(digest, "^sha256:[a-fA-F0-9]{64}$") || size is <= 0 or > 200_000_000) return;

            var url = $"https://github.com/{Repository}/releases/download/{tag}/{name}";
            temporary = Path.Combine(Path.GetTempPath(), $"TAH-{Guid.NewGuid():N}.exe");
            using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
            using var download = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            download.EnsureSuccessStatusCode();
            using var source = await download.Content.ReadAsStreamAsync(timeout.Token);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var destination = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true))
            {
                var buffer = new byte[65536];
                long bytes = 0;
                int count;
                while ((count = await source.ReadAsync(buffer, timeout.Token)) > 0)
                {
                    bytes += count;
                    if (bytes > size) return;
                    hash.AppendData(buffer, 0, count);
                    await destination.WriteAsync(buffer.AsMemory(0, count), timeout.Token);
                }
                if (bytes != size || !Convert.ToHexString(hash.GetHashAndReset()).Equals(digest[7..], StringComparison.OrdinalIgnoreCase)) return;
            }
            if (window.IsDisposed || MessageBox.Show(window, $"TAH {available} is ready. Install now and reopen TAH?",
                "TAH update", MessageBoxButtons.YesNo, MessageBoxIcon.Information) != DialogResult.Yes) return;
            using var installer = Process.Start(new ProcessStartInfo(temporary,
                "/SP- /SILENT /NORESTART") { UseShellExecute = false });
            if (installer == null) return;
            temporary = null;
            window.Close();
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or IOException
            or UnauthorizedAccessException or JsonException or InvalidOperationException or KeyNotFoundException
            or System.ComponentModel.Win32Exception or FormatException)
        {
            Debug.WriteLine(error.Message);
            if (manual && !window.IsDisposed) MessageBox.Show(window, "Could not check for updates. Try again later.", "TAH update");
        }
        finally
        {
            Interlocked.Exchange(ref checking, 0);
            if (temporary != null) try { File.Delete(temporary); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }
}
