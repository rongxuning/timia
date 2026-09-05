import Compression
import Foundation

enum GzipError: Error {
    case compressionFailed
}

extension Data {
    /// Returns gzip-compressed data (RFC 1952) for `Content-Encoding: gzip`.
    func gzipCompressed() throws -> Data {
        var output = Data()
        // Minimal gzip header (deflate, no optional fields).
        output.append(contentsOf: [0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF])

        let deflated = try deflateRaw()
        output.append(deflated)

        var crc = gzipCRC32().littleEndian
        output.append(Data(bytes: &crc, count: 4))
        var isize = UInt32(truncatingIfNeeded: count).littleEndian
        output.append(Data(bytes: &isize, count: 4))
        return output
    }

    /// Raw DEFLATE payload extracted from zlib output (strip 2-byte header + 4-byte Adler-32).
    private func deflateRaw() throws -> Data {
        let bufferSize = 64 * 1024
        var zlibOutput = Data()

        try withUnsafeBytes { (src: UnsafeRawBufferPointer) in
            guard let srcBase = src.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }

            var stream = compression_stream()
            let initStatus = compression_stream_init(&stream, COMPRESSION_STREAM_ENCODE, COMPRESSION_ZLIB)
            guard initStatus != COMPRESSION_STATUS_ERROR else { throw GzipError.compressionFailed }
            defer { compression_stream_destroy(&stream) }

            stream.src_ptr = srcBase
            stream.src_size = count

            let dstBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { dstBuffer.deallocate() }

            repeat {
                stream.dst_ptr = dstBuffer
                stream.dst_size = bufferSize

                let flags: Int32 = stream.src_size == 0 ? Int32(COMPRESSION_STREAM_FINALIZE.rawValue) : 0
                let status = compression_stream_process(&stream, flags)
                guard status != COMPRESSION_STATUS_ERROR else { throw GzipError.compressionFailed }

                let produced = bufferSize - stream.dst_size
                if produced > 0 {
                    zlibOutput.append(dstBuffer, count: produced)
                }

                if status == COMPRESSION_STATUS_END {
                    break
                }
                guard status == COMPRESSION_STATUS_OK else { throw GzipError.compressionFailed }
            } while true
        }

        guard zlibOutput.count >= 6 else { throw GzipError.compressionFailed }
        return zlibOutput.subdata(in: 2 ..< (zlibOutput.count - 4))
    }

    private func gzipCRC32() -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in self {
            let index = Int((crc ^ UInt32(byte)) & 0xFF)
            crc = (crc >> 8) ^ Self.crc32Table[index]
        }
        return crc ^ 0xFFFF_FFFF
    }

    private static let crc32Table: [UInt32] = {
        (0 ..< 256).map { index -> UInt32 in
            var value = UInt32(index)
            for _ in 0 ..< 8 {
                value = (value & 1) == 1 ? (0xEDB8_8320 ^ (value >> 1)) : (value >> 1)
            }
            return value
        }
    }()
}
