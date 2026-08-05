import SwiftUI

/// Compact chip that displays a single attachment.
///
/// Use it inside the input form (with `onRemove`) and on cards (read-only).
struct AttachmentChip: View {
    let attachment: StickyNoteAttachment
    var onRemove: (() -> Void)? = nil
    var onTap: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(attachment.filename)
                .font(.footnote)
                .lineLimit(1)
                .truncationMode(.middle)
            if let onRemove {
                Button {
                    onRemove()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(TimiaTheme.field, in: Capsule())
        .overlay(Capsule().stroke(TimiaTheme.border.opacity(0.5)))
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("附件 \(attachment.filename)")
    }

    private var iconName: String {
        switch attachment.mimeType {
        case let m where m.hasPrefix("image/"): return "photo"
        case let m where m.hasPrefix("audio/"): return "waveform"
        case let m where m.hasPrefix("video/"): return "film"
        case let m where m.hasPrefix("text/"): return "doc.text"
        default: return "paperclip"
        }
    }
}

/// Read-only variant for `PendingAttachment` (pre-upload). Same visual.
struct PendingAttachmentChip: View {
    let attachment: PendingAttachment
    var onRemove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(attachment.filename)
                .font(.footnote)
                .lineLimit(1)
                .truncationMode(.middle)
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(TimiaTheme.field, in: Capsule())
        .overlay(Capsule().stroke(TimiaTheme.border.opacity(0.5)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("待上传附件 \(attachment.filename)")
    }

    private var iconName: String {
        switch attachment.mimeType {
        case let m where m.hasPrefix("image/"): return "photo"
        case let m where m.hasPrefix("audio/"): return "waveform"
        case let m where m.hasPrefix("video/"): return "film"
        case let m where m.hasPrefix("text/"): return "doc.text"
        default: return "paperclip"
        }
    }
}
