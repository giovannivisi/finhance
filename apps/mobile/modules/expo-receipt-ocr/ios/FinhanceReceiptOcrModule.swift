import ExpoModulesCore
import ImageIO
import UIKit
import Vision

public final class FinhanceReceiptOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FinhanceReceiptOcr")

    AsyncFunction("recognizeTextAsync") { (uri: URL) throws -> String in
      try recogniseText(at: uri)
    }
  }
}

private func recogniseText(at sourceURL: URL) throws -> String {
  guard sourceURL.isFileURL else {
    throw ReceiptOcrException("The selected receipt is not a local image.")
  }

  defer {
    removeTemporaryReceiptImage(at: sourceURL)
  }

  guard let image = UIImage(contentsOfFile: sourceURL.path),
        let cgImage = image.cgImage else {
    throw ReceiptOcrException("The selected receipt image could not be read.")
  }

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["it-IT", "en-US"]
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(
    cgImage: cgImage,
    orientation: visionOrientation(for: image.imageOrientation),
    options: [:]
  )

  do {
    try handler.perform([request])
  } catch {
    throw ReceiptOcrException("Receipt text recognition did not finish.")
  }

  let observations = (request.results ?? []).sorted(by: readsBefore)
  return observations
    .compactMap { $0.topCandidates(1).first?.string }
    .joined(separator: "\n")
}

private func readsBefore(
  _ first: VNRecognizedTextObservation,
  _ second: VNRecognizedTextObservation
) -> Bool {
  let verticalDistance = abs(first.boundingBox.midY - second.boundingBox.midY)

  if verticalDistance < 0.02 {
    return first.boundingBox.minX < second.boundingBox.minX
  }

  return first.boundingBox.midY > second.boundingBox.midY
}

private func visionOrientation(
  for orientation: UIImage.Orientation
) -> CGImagePropertyOrientation {
  switch orientation {
  case .up:
    return .up
  case .down:
    return .down
  case .left:
    return .left
  case .right:
    return .right
  case .upMirrored:
    return .upMirrored
  case .downMirrored:
    return .downMirrored
  case .leftMirrored:
    return .leftMirrored
  case .rightMirrored:
    return .rightMirrored
  @unknown default:
    return .up
  }
}

private func removeTemporaryReceiptImage(at url: URL) {
  let fileManager = FileManager.default
  let candidateDirectories = [
    URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true),
    fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first,
  ].compactMap { $0?.standardizedFileURL }
  let sourcePath = url.standardizedFileURL.path

  guard candidateDirectories.contains(where: { directory in
    let directoryPath = directory.path
    return sourcePath == directoryPath ||
      sourcePath.hasPrefix("\(directoryPath)/")
  }) else {
    return
  }

  try? fileManager.removeItem(at: url)
}

private final class ReceiptOcrException: GenericException<String> {
  override var reason: String {
    param
  }
}
