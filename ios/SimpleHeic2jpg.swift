//
//  SimpleHeic2jpg.swift
//
//  Created by rudy.lee on 2023/09/20.
//

import Foundation
import UIKit
import ImageIO

/// `SimpleHeic2jpg`는 이미지 형식을 변환하고 메타데이터를 유지하는 클래스입니다.
/// HEIC 및 HEIF 형식을 JPEG 형식으로 변환하며, 이미 JPEG 또는 PNG 형식인 이미지는 원래 형식을 유지합니다.
/// `convertImageAtPath` 메소드는 파일 경로를 입력 받아, 변환에 성공하면 새 파일 경로를 프로미스 콜백을 통해 반환합니다.

@objc(SimpleHeic2jpg)
class SimpleHeic2jpg: NSObject {

    @objc public func convertImageAtPath(_ path: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let url = URL(string: path) else {
            reject("Invalid URL", "The URL is invalid", nil)
            return
        }

        guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
              let imageType = CGImageSourceGetType(imageSource) as String? else {
            reject("Error Creating Image Source", "Cannot create image source", nil)
            return
        }

        let filePath = path.replacingOccurrences(of: "file://", with: "")
        let outputImagePath = (filePath as NSString).deletingPathExtension.appending(".jpeg")
        let destinationURL = URL(fileURLWithPath: outputImagePath)

        if imageType == "public.heic" || imageType == "public.heif" {
            guard let tempImage = try? Data(contentsOf: url),
                  let image = UIImage(data: tempImage) else {
                reject("Error Loading Image", "Failed to load image from path: \(path)", nil)
                return
            }

            guard let cgImage = image.cgImage,
                  let colorSpace = cgImage.colorSpace else {
                reject("Error Processing Image", "Failed to process image data", nil)
                return
            }

            let ciImage = CIImage(cgImage: cgImage)
            let context = CIContext()

            guard let imageData = context.jpegRepresentation(of: ciImage, colorSpace: colorSpace, options: [:]) else {
                  reject("Image Conversion Failed", "Image conversion to JPEG representation failed", nil)
                  return
            }

            createImageDestination(imageData: imageData, imageSource: imageSource, destinationURL: destinationURL, resolve: resolve, reject: reject)
        } else if imageType == "public.jpeg" || imageType == "public.png" {
            resolve(path)
        } else {
            reject("Unsupported Image Format", "Unsupported image format", nil)
        }
    }

    private func createImageDestination(imageData: Data, imageSource: CGImageSource, destinationURL: URL, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        do {
            let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
            guard let source = CGImageSourceCreateWithData(imageData as CFData, sourceOptions) else {
                reject("Error Creating Image Source", "Failed to create image source with JPEG data", nil)
                return
            }

            let type = CGImageSourceGetType(source)!
            guard let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, type, 1, nil) else {
                reject("Error Creating Image Destination", "Failed to create image destination at URL: \(destinationURL)", nil)
                return
            }

            let imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil)
            CGImageDestinationAddImageFromSource(destination, source, 0, imageProperties)

            if !CGImageDestinationFinalize(destination) {
                throw NSError(domain: "", code: 400, userInfo: [NSLocalizedDescriptionKey: "Failed to write image"])
            }

            resolve(destinationURL.path)
        } catch {
            reject("Error Writing Image", "Failed to write image", error)
        }
    }
}
