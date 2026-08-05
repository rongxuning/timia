import SwiftUI

/// Top half of ``StickyNoteView`` — a persistent form for the next note.
///
/// Layout (top → bottom):
///   * One input area: first line = title (bold, larger), rest = body.
///     The first line is automatically styled via ``TitleBodyTextEditor``;
///     when the user presses enter after the title, the body starts on
///     a new line below it.
///   * Bottom row:
///       - Left:  VStack of `附件` + `位置` chips
///       - Right: `保存` button
struct StickyNoteInputView: View {
    @ObservedObject var draft: StickyNoteDraftStore
    @Binding var locationError: String?
    var onPickAttachments: () -> Void
    var onRequestLocation: () -> Void
    var onClearLocation: () -> Void
    var onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TitleBodyTextEditor(text: $draft.combined, minHeight: 140)
                .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 10))

            bottomRow
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Bottom row

    private var bottomRow: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                attachmentChip
                LocationChip(
                    snapshot: draft.location,
                    onTap: onRequestLocation,
                    onClear: draft.location == nil ? nil : onClearLocation
                )
                if let err = locationError {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                if let err = draft.lastError {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(2)
                        .multilineTextAlignment(.trailing)
                }
                Button(action: onSave) {
                    HStack(spacing: 4) {
                        if draft.isSaving {
                            ProgressView().tint(.white).controlSize(.small)
                        } else {
                            Image(systemName: "tray.and.arrow.down")
                        }
                        Text("保存")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(draft.canSubmit ? TimiaTheme.primary : Color.secondary.opacity(0.35), in: Capsule())
                }
                .disabled(!draft.canSubmit)
            }
        }
    }

    @ViewBuilder
    private var attachmentChip: some View {
        HStack(spacing: 6) {
            Button(action: onPickAttachments) {
                HStack(spacing: 4) {
                    Image(systemName: "paperclip")
                    Text(draft.pendingAttachments.isEmpty ? "附件" : "附件 (\(draft.pendingAttachments.count))")
                }
                .font(.footnote.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(TimiaTheme.field, in: Capsule())
                .overlay(Capsule().stroke(TimiaTheme.border.opacity(0.5)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("添加附件")

            ForEach(draft.pendingAttachments) { p in
                PendingAttachmentChip(attachment: p) {
                    draft.pendingAttachments.removeAll { $0.id == p.id }
                }
            }
        }
    }
}
