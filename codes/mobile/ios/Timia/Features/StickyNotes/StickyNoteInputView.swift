import SwiftUI

/// The top half of ``StickyNoteView`` — a persistent form for the next
/// note. Always visible so the user can type (or speak) without an extra tap.
struct StickyNoteInputView: View {
    @ObservedObject var draft: StickyNoteDraftStore
    @Binding var locationError: String?
    var onPickAttachments: () -> Void
    var onRequestLocation: () -> Void
    var onClearLocation: () -> Void
    var onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Title (optional)
            TextField("标题（可选）", text: $draft.title)
                .font(.subheadline)
                .textInputAutocapitalization(.sentences)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 8))

            // Content (required)
            ZStack(alignment: .topLeading) {
                if draft.content.isEmpty {
                    Text("内容")
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 12)
                        .padding(.top, 10)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $draft.content)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 60, maxHeight: 120)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
            }
            .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 8))

            // Attachments row
            attachmentRow

            // Location + error row
            HStack(spacing: 8) {
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
                Spacer()
            }

            // Save row
            HStack {
                if let err = draft.lastError {
                    Text(err)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(2)
                }
                Spacer()
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
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var attachmentRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
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
}
