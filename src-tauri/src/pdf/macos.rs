//! WKWebView 打印到文件（specs/015 plan 设计要点 5，research.md R8 T1503）。
//! 同步的 `runOperation` 在隐藏窗口中会卡住，必须用 `runOperationModalForWindow`，完成时由代理回调通知。

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Bool, ProtocolObject};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintOperation, NSPrintSaveJob, NSWindow};
use objc2_foundation::{NSCopying, NSObject, NSSize, NSString, NSURL};
use objc2_web_kit::WKWebView;
use std::cell::RefCell;
use std::ffi::c_void;
use std::path::Path;
use std::sync::mpsc::Sender;
use tauri::{Runtime, WebviewWindow};

/// 与 WebView2 `PrintToPdf` 不传设置时的默认值相同（Letter 8.5×11 英寸、四边 1cm），两平台导出结果一致
const PAPER: NSSize = NSSize::new(612.0, 792.0);
const MARGIN: f64 = 28.35;

define_class!(
    // SAFETY: 只实现打印完成回调，父类 NSObject 无额外要求
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "InkmarkPdfDone"]
    #[ivars = RefCell<Option<Sender<bool>>>]
    struct PdfDone;

    impl PdfDone {
        // SAFETY: 签名与 NSPrintOperation 的 didRunSelector 要求一致
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _op: &NSPrintOperation, success: Bool, _ctx: *mut c_void) {
            if let Some(tx) = self.ivars().borrow_mut().take() {
                let _ = tx.send(success.as_bool());
            }
        }
    }
);

thread_local! {
    /// 打印操作不保证持有代理，导出期间由这里持有；下次导出时替换
    static PENDING: RefCell<Option<Retained<PdfDone>>> = const { RefCell::new(None) };
}

/// 开始把已加载的页面打印到 `out`；完成后向 `done` 发送是否成功。
pub fn start<R: Runtime>(win: &WebviewWindow<R>, out: &Path, done: Sender<bool>) -> Result<(), String> {
    let out = out.to_string_lossy().into_owned();
    win.with_webview(move |wv| {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = done.send(false);
            return;
        };
        // SAFETY: with_webview 在主线程中调用，inner / ns_window 为该窗口的 WKWebView 与 NSWindow
        let (view, window) = unsafe { (&*wv.inner().cast::<WKWebView>(), &*wv.ns_window().cast::<NSWindow>()) };

        let info: Retained<NSPrintInfo> = NSPrintInfo::sharedPrintInfo().copy();
        // SAFETY: 设置项均为 NSPrintInfo 公开属性；NSPrintJobSavingURL 的值须为 NSURL
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            let url = NSURL::fileURLWithPath(&NSString::from_str(&out));
            let value: &AnyObject = url.as_ref();
            info.dictionary()
                .setObject_forKey(value, ProtocolObject::from_ref(NSPrintJobSavingURL));
        }
        info.setPaperSize(PAPER);
        info.setTopMargin(MARGIN);
        info.setBottomMargin(MARGIN);
        info.setLeftMargin(MARGIN);
        info.setRightMargin(MARGIN);

        // SAFETY: 主线程中调用，info 为有效的打印设置
        let op = unsafe { view.printOperationWithPrintInfo(&info) };
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);

        let delegate = PdfDone::alloc(mtm).set_ivars(RefCell::new(Some(done)));
        // SAFETY: NSObject 的 init
        let delegate: Retained<PdfDone> = unsafe { msg_send![super(delegate), init] };
        // SAFETY: 代理实现了 didRunSelector；contextInfo 不使用
        unsafe {
            op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                std::ptr::null_mut(),
            );
        }
        PENDING.with(|p| p.replace(Some(delegate)));
    })
    .map_err(|e| e.to_string())
}
