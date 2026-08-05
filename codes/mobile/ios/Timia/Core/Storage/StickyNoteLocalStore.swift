import Foundation

/// Manages sticky-note attachment files on disk.
///
/// v1: files live under
///     ``~/Documents/Timia/sticky-notes/{noteId}/{attachmentId}/{filename}``
///
/// The backend only stores metadata + a ``local://`` placeholder URL.
/// This store is the source of truth for the actual bytes.
struct StickyNoteLocalStore: Sendable {
    static let shared = StickyNoteLocalStore()

    private let root: URL

    init(root: URL? = nil) {
        if let root {
            self.root = root
        } else {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSTemporaryDirectory())
            self.root = docs.appendingPathComponent("Timia/sticky-notes", isDirectory: true)
        }
        try? FileManager.default.createDirectory(at: root!, withIntermediateDirectories: true)
    }

    // MARK: - Paths

    func directory(for noteId: String, attachmentId: String) -> URL {
        let dir = root
            .appendingPathComponent(noteId, isDirectory: true)
            .appendingPathComponent(attachmentId, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func fileURL(noteId: String, attachmentId: String, filename: String) -> URL {
        directory(for: noteId, attachmentId: attachmentId).appendingPathComponent(filename)
    }

    // MARK: - Read / write

    /// Copy a picked-file URL into the per-attachment folder and return the
    /// canonical filename (basename). The caller persists the metadata.
    func ingest(source: URL, noteId: String, attachmentId: String) throws -> (filename: String, byteSize: Int) {
        let filename = source.lastPathComponent
        let dest = fileURL(noteId: noteId, attachmentId: attachmentId, filename: filename)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: source, to: dest)
        let attrs = try FileManager.default.attributesOfItem(atPath: dest.path)
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        return (filename, size)
    }

    func readData(noteId: String, attachmentId: String, filename: String) -> Data? {
        let url = fileURL(noteId: noteId, attachmentId: attachmentId, filename: filename)
        return try? Data(contentsOf: url)
    }

    func remove(noteId: String, attachmentId: String) throws {
        let dir = root
            .appendingPathComponent(noteId, isDirectory: true)
            .appendingPathComponent(attachmentId, isDirectory: true)
        if FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.removeItem(at: dir)
        }
    }

    func purgeNote(_ noteId: String) {
        let dir = root.appendingPathComponent(noteId, isDirectory: true)
        try? FileManager.default.removeItem(at: dir)
    }
}
