import SwiftUI
import UIKit

/// A multi-line text editor where the *first line* is rendered as a bold,
/// larger title and subsequent lines use the regular body font.
///
/// Placeholder text ("标题" + "写点什么...") is rendered as the text view's
/// own content when the bound text is empty — it appears as the first / second
/// line inside the text view, not as a floating overlay.
struct TitleBodyTextEditor: UIViewRepresentable {
    @Binding var text: String
    var titlePlaceholder: String = "标题"
    var bodyPlaceholder: String = "写点什么..."
    var minHeight: CGFloat = 120

    func makeUIView(context: Context) -> UITextView {
        let textView = PlaceholderTextView()
        textView.delegate = context.coordinator
        textView.font = UIFont.preferredFont(forTextStyle: .body)
        textView.backgroundColor = .clear
        textView.isScrollEnabled = true
        textView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        textView.adjustsFontForContentSizeCategory = true
        textView.keyboardDismissMode = .interactive
        textView.minHeight = minHeight

        // Keyboard toolbar with Done button — styled to match TimiaTheme.keyboardDoneToolbar.
        let toolbar = UIToolbar(frame: CGRect(x: 0, y: 0, width: UIScreen.main.bounds.width, height: 44))
        toolbar.barStyle = .default
        let flexSpace = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let doneButton = UIBarButtonItem(
            title: "完成",
            style: .done,
            target: context.coordinator,
            action: #selector(Coordinator.dismissKeyboard)
        )
        doneButton.setTitleTextAttributes([.font: UIFont.systemFont(ofSize: 17, weight: .semibold)], for: .normal)
        toolbar.items = [flexSpace, doneButton]
        textView.inputAccessoryView = toolbar

        context.coordinator.textView = textView

        // Show placeholder if the initial text is empty.
        if context.coordinator.parent.text.isEmpty {
            textView.showPlaceholder(
                title: context.coordinator.parent.titlePlaceholder,
                body: context.coordinator.parent.bodyPlaceholder
            )
        }

        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        guard let textView = uiView as? PlaceholderTextView else { return }
        let isComposing = uiView.markedTextRange != nil
        if !isComposing {
            // Sync binding → text view when not currently showing placeholder.
            // The placeholder state is managed only by:
            //   - makeUIView (initial show)
            //   - textViewDidBeginEditing (hide on first tap)
            //   - textViewDidEndEditing (re-show if user finished empty)
            // We do NOT re-show the placeholder here, otherwise typing into
            // the placeholder would leave the placeholder text behind.
            if !textView.isShowingPlaceholder && textView.text != text {
                textView.text = text
            }
            if !textView.isShowingPlaceholder {
                applyAttributes(to: textView)
            }
        }
    }

    /// Style the first line (everything up to the first newline, or all the
    /// text if there is no newline) with a bold title font. The remainder
    /// uses the body font. After the title, leave a 12pt gap before the
    /// body so the boundary is visible.
    private func applyAttributes(to textView: UITextView) {
        let bodyFont = UIFont.preferredFont(forTextStyle: .body)
        let titleDescriptor = UIFont
            .preferredFont(forTextStyle: .title3)
            .fontDescriptor.withSymbolicTraits(.traitBold)
            ?? UIFont.preferredFont(forTextStyle: .title3).fontDescriptor
        let titleFont = UIFont(descriptor: titleDescriptor, size: 0)

        let attributed = NSMutableAttributedString(string: textView.text)
        let fullRange = NSRange(location: 0, length: attributed.length)
        attributed.addAttribute(.font, value: bodyFont, range: fullRange)

        if !textView.text.isEmpty {
            if let newlineIdx = textView.text.firstIndex(of: "\n") {
                let titleLength = textView.text.distance(from: textView.text.startIndex, to: newlineIdx)
                if titleLength > 0 {
                    let titleStyle = NSMutableParagraphStyle()
                    titleStyle.paragraphSpacing = 12
                    attributed.addAttribute(.font, value: titleFont, range: NSRange(location: 0, length: titleLength))
                    attributed.addAttribute(.paragraphStyle, value: titleStyle, range: NSRange(location: 0, length: titleLength))
                }
            } else {
                attributed.addAttribute(.font, value: titleFont, range: fullRange)
            }
        }

        let selection = textView.selectedRange
        textView.attributedText = attributed
        textView.selectedRange = selection
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    // MARK: - PlaceholderTextView

    /// UITextView subclass that tracks whether it is currently showing placeholder
    /// text so the representable can distinguish "empty with placeholder" from
    /// "empty with no content".
    final class PlaceholderTextView: UITextView {
        var isShowingPlaceholder: Bool = false
        var minHeight: CGFloat = 120

        private let titleFont: UIFont = {
            let desc = UIFont.preferredFont(forTextStyle: .title3)
                .fontDescriptor.withSymbolicTraits(.traitBold)
                ?? UIFont.preferredFont(forTextStyle: .title3).fontDescriptor
            return UIFont(descriptor: desc, size: 0)
        }()

        private let bodyFont = UIFont.preferredFont(forTextStyle: .body)

        override var intrinsicContentSize: CGSize {
            let h = max(minHeight, contentSize.height + textContainerInset.top + textContainerInset.bottom)
            return CGSize(width: UIView.noIntrinsicMetric, height: h)
        }

        func showPlaceholder(title: String, body: String) {
            isShowingPlaceholder = true
            let titleAttr: [NSAttributedString.Key: Any] = [
                .font: titleFont,
                .foregroundColor: UIColor.placeholderText
            ]
            let bodyAttr: [NSAttributedString.Key: Any] = [
                .font: bodyFont,
                .foregroundColor: UIColor.placeholderText
            ]
            let titleText = NSAttributedString(string: title, attributes: titleAttr)
            let newline = NSAttributedString(string: "\n", attributes: bodyAttr)
            let bodyText = NSAttributedString(string: body, attributes: bodyAttr)
            let combined = NSMutableAttributedString()
            combined.append(titleText)
            combined.append(newline)
            combined.append(bodyText)
            attributedText = combined
            selectedRange = NSRange(location: 0, length: 0)
        }

        func hidePlaceholder(setText newText: String) {
            isShowingPlaceholder = false
            text = newText
        }
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, UITextViewDelegate {
        let parent: TitleBodyTextEditor
        weak var textView: PlaceholderTextView?

        init(_ parent: TitleBodyTextEditor) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            guard let placeholderView = textView as? PlaceholderTextView else { return }

            // If user deleted all text, switch back to placeholder.
            if textView.text.isEmpty && !placeholderView.isShowingPlaceholder {
                placeholderView.showPlaceholder(title: parent.titlePlaceholder, body: parent.bodyPlaceholder)
                parent.text = ""
                return
            }

            // Skip if we're showing placeholder (text is still being composed).
            if placeholderView.isShowingPlaceholder { return }

            let updated = textView.text ?? ""
            if parent.text != updated {
                parent.text = updated
            }
            if textView.markedTextRange == nil {
                parent.applyAttributes(to: textView)
            }
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            guard let placeholderView = textView as? PlaceholderTextView else { return }
            // If placeholder is showing, clear it on first tap so user can type.
            if placeholderView.isShowingPlaceholder {
                placeholderView.hidePlaceholder(setText: "")
            }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            guard let placeholderView = textView as? PlaceholderTextView else { return }
            // If nothing was entered, restore placeholder.
            if textView.text.isEmpty {
                placeholderView.showPlaceholder(title: parent.titlePlaceholder, body: parent.bodyPlaceholder)
            }
        }

        @objc func dismissKeyboard() {
            textView?.window?.endEditing(true)
        }
    }
}
