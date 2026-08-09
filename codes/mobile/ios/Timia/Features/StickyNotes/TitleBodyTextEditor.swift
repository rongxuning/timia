import SwiftUI
import UIKit

/// A multi-line text editor where the *first line* is rendered as a bold,
/// larger title and subsequent lines use the regular body font.
///
/// Implemented with UIViewRepresentable because SwiftUI's ``TextEditor`` does
/// not yet support per-range attributed styling reliably across edits.
///
/// The single source of truth is ``text`` — a regular `String`. On every
/// keystroke we re-apply the first-line title style so it follows the cursor
/// as the user adds new lines.
struct TitleBodyTextEditor: UIViewRepresentable {
    @Binding var text: String
    var placeholder: String = ""
    var minHeight: CGFloat = 120

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.delegate = context.coordinator
        textView.font = UIFont.preferredFont(forTextStyle: .body)
        textView.backgroundColor = .clear
        textView.isScrollEnabled = true
        textView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        textView.adjustsFontForContentSizeCategory = true
        textView.keyboardDismissMode = .interactive
        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        // Only touch attributedText when the user is NOT in the middle of
        // composing (e.g. Chinese IME). Setting attributedText while markedTextRange
        // is active disrupts the IME candidate selection and drops characters.
        let isComposing = uiView.markedTextRange != nil
        if !isComposing {
            if uiView.text != text {
                uiView.text = text
            }
            applyAttributes(to: uiView)
        }
    }

    /// Style the first line (everything up to the first newline, or all the
    /// text if there is no newline) with a bold title font. The remainder
    /// uses the body font. After the title, leave a 4pt gap before the
    /// body so the boundary is visible.
    private func applyAttributes(to textView: UITextView) {
        let bodyFont = UIFont.preferredFont(forTextStyle: .body)
        let titleDescriptor = UIFont
            .preferredFont(forTextStyle: .title3)
            .fontDescriptor.withSymbolicTraits(.traitBold) ?? UIFont.preferredFont(forTextStyle: .title3).fontDescriptor
        let titleFont = UIFont(descriptor: titleDescriptor, size: 0)

        let attributed = NSMutableAttributedString(string: textView.text)
        let fullRange = NSRange(location: 0, length: attributed.length)
        attributed.addAttribute(.font, value: bodyFont, range: fullRange)

        if !textView.text.isEmpty {
            if let newlineIdx = textView.text.firstIndex(of: "\n") {
                let titleLength = textView.text.distance(from: textView.text.startIndex, to: newlineIdx)
                if titleLength > 0 {
                    // Title font + 4pt gap after the title line.
                    let titleStyle = NSMutableParagraphStyle()
                    titleStyle.paragraphSpacing = 4
                    attributed.addAttribute(
                        .font,
                        value: titleFont,
                        range: NSRange(location: 0, length: titleLength)
                    )
                    attributed.addAttribute(
                        .paragraphStyle,
                        value: titleStyle,
                        range: NSRange(location: 0, length: titleLength)
                    )
                }
            } else {
                // No newline yet — the entire text is the "title line"
                attributed.addAttribute(.font, value: titleFont, range: fullRange)
            }
        }

        // Preserve selection while re-applying the attributes.
        let selection = textView.selectedRange
        textView.attributedText = attributed
        textView.selectedRange = selection
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        let parent: TitleBodyTextEditor

        init(_ parent: TitleBodyTextEditor) {
            self.parent = parent
        }

        func textViewDidChange(_ textView: UITextView) {
            // Pull the plain text out so the model stays as String.
            let updated = textView.text ?? ""
            if parent.text != updated {
                parent.text = updated
            }
            // Skip re-styling while the IME is still composing (markedTextRange
            // is non-nil). Setting attributedText here drops the composing text.
            if textView.markedTextRange == nil {
                parent.applyAttributes(to: textView)
            }
        }
    }
}
