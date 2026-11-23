import SwiftUI
import WebKit

@main
struct TAHApp: App {
    var body: some Scene {
        WindowGroup { PortalScreen() }
    }
}

struct PortalScreen: View {
    @Environment(\.scenePhase) private var phase
    @State private var captured = UIScreen.main.isCaptured

    var body: some View {
        ZStack {
            if !captured {
                PortalWebView().opacity(phase == .active ? 1 : 0)
            }
            if captured || phase != .active {
                Color.black.ignoresSafeArea()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)) { _ in
            captured = UIScreen.main.isCaptured
        }
    }
}

struct PortalWebView: UIViewRepresentable {
    static let host = "tah-private-mentorship-git-fe-446289-arsalans-projects-583e344d.vercel.app"

    func makeCoordinator() -> Navigation { Navigation() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.isInspectable = false
        web.navigationDelegate = context.coordinator
        #if TAH_ADMIN
        let path = "/admin/"
        #else
        let path = "/"
        #endif
        if let url = URL(string: "https://" + Self.host + path) {
            web.load(URLRequest(url: url))
        }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    class Navigation: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let frame = action.targetFrame else { decisionHandler(.cancel); return }
            guard frame.isMainFrame else { decisionHandler(.allow); return }
            let url = action.request.url
            decisionHandler(url?.scheme == "https" && url?.host == PortalWebView.host ? .allow : .cancel)
        }
    }
}
