import SwiftUI

/// Bottom half of ``StickyNoteView`` — a vertical stack of ``StickyNoteCard``s,
/// newest first, with an infinite-scroll trigger near the bottom.
struct StickyNoteListView: View {
    @ObservedObject var model: StickyNoteListModel
    let api: StickyNotesAPI
    var onEdit: (StickyNote) -> Void = { _ in }
    var onTaskCreated: ((StickyNoteConvertResponse) -> Void)? = nil

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                if model.notes.isEmpty && !model.isLoading {
                    emptyState
                }
                ForEach(model.notes) { note in
                    StickyNoteCard(
                        note: note,
                        api: api,
                        onEdit: onEdit,
                        onChanged: { updated in
                            model.replace(updated)
                        },
                        onArchived: {
                            model.remove(note.id)
                        },
                        onTaskCreated: onTaskCreated
                    )
                    .onAppear {
                        if note == model.notes.last {
                            Task { await model.loadMore(api: api) }
                        }
                    }
                }
                if model.isLoading && !model.notes.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
        }
        .background(TimiaTheme.canvas)
        .refreshable {
            await model.refresh(api: api)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "note.text")
                .font(.system(size: 36))
                .foregroundStyle(.tertiary)
            Text("还没有便利贴")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("在上面的输入框里写下你的第一条笔记")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }
}
