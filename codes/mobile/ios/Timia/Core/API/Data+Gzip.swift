import Foundation
import zlib

enum GzipError: Error {
    case compressionFailed
    case decompressionFailed
}

extension Data {
    /// RFC 1952 gzip. Uses system zlib (`windowBits` 15+16) so the payload
    /// matches Python `gzip.decompress` / `Content-Encoding: gzip`.
    func gzipCompressed() throws -> Data {
        try gzipTransform(compress: true)
    }

    func gzipDecompressed() throws -> Data {
        try gzipTransform(compress: false)
    }

    private func gzipTransform(compress: Bool) throws -> Data {
        var stream = z_stream()
        let windowBits: Int32 = 15 + 16
        let initStatus: Int32
        if compress {
            initStatus = deflateInit2_(
                &stream,
                Z_DEFAULT_COMPRESSION,
                Z_DEFLATED,
                windowBits,
                8,
                Z_DEFAULT_STRATEGY,
                ZLIB_VERSION,
                Int32(MemoryLayout<z_stream>.size)
            )
        } else {
            initStatus = inflateInit2_(&stream, windowBits, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size))
        }
        guard initStatus == Z_OK else {
            throw compress ? GzipError.compressionFailed : GzipError.decompressionFailed
        }
        defer {
            if compress {
                deflateEnd(&stream)
            } else {
                inflateEnd(&stream)
            }
        }

        return try withUnsafeBytes { src in
            if count > 0 {
                guard let base = src.bindMemory(to: Bytef.self).baseAddress else {
                    throw compress ? GzipError.compressionFailed : GzipError.decompressionFailed
                }
                stream.next_in = UnsafeMutablePointer(mutating: base)
                stream.avail_in = uInt(count)
            } else {
                stream.next_in = nil
                stream.avail_in = 0
            }

            var output = Data()
            let chunkSize = 64 * 1024
            var chunk = [Bytef](repeating: 0, count: chunkSize)

            while true {
                let status = chunk.withUnsafeMutableBufferPointer { dest -> Int32 in
                    stream.next_out = dest.baseAddress
                    stream.avail_out = uInt(chunkSize)
                    if compress {
                        return deflate(&stream, Z_FINISH)
                    }
                    return inflate(&stream, Z_NO_FLUSH)
                }
                let produced = chunkSize - Int(stream.avail_out)
                if produced > 0 {
                    output.append(chunk, count: produced)
                }
                if status == Z_STREAM_END {
                    return output
                }
                // Output buffer filled; keep going. zlib uses Z_OK or Z_BUF_ERROR here.
                let canContinue = (status == Z_OK && produced > 0)
                    || (status == Z_BUF_ERROR && produced > 0)
                if canContinue {
                    continue
                }
                throw compress ? GzipError.compressionFailed : GzipError.decompressionFailed
            }
        }
    }
}
