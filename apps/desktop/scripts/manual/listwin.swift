// listwin.swift — SwaggerMan 본 창 나열 (다른 Space 포함)
// 매뉴얼 스크린샷 자동화용. 실행: swift listwin.swift
// 출력: "창ID|너비|높이|x|y" 줄들 (Screen Recording 권한 필요)
import CoreGraphics
import Foundation

let windowInfoList = CGWindowListCopyWindowInfo([.excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []

for windowInfo in windowInfoList {
    guard let owner = windowInfo["kCGWindowOwnerName"] as? String, owner == "SwaggerMan",
          let layer = windowInfo["kCGWindowLayer"] as? Int, layer == 0,
          let boundsDict = windowInfo["kCGWindowBounds"] as? [String: Any],
          let width = (boundsDict["Width"] as? NSNumber)?.intValue, width > 300,
          let height = (boundsDict["Height"] as? NSNumber)?.intValue, height > 300,
          let windowID = windowInfo["kCGWindowNumber"] as? Int,
          let originX = (boundsDict["X"] as? NSNumber)?.intValue,
          let originY = (boundsDict["Y"] as? NSNumber)?.intValue
    else { continue }
    print("\(windowID)|\(width)|\(height)|\(originX)|\(originY)")
}
