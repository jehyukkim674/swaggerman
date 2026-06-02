// click.swift — CGEvent 기반 클릭·스크롤 CLI (Accessibility 권한 필요)
// 매뉴얼 스크린샷 자동화용. 컴파일: swiftc -O -o click click.swift
// 사용법: click <x> <y>            : 좌클릭 (논리 좌표)
//        click <x> <y> double      : 더블클릭
//        click <x> <y> scroll <dy> : 해당 위치에서 세로 스크롤(dy>0 위로)
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let xPos = Double(args[1]), let yPos = Double(args[2]) else {
    print("usage: click <x> <y> [double|scroll <dy>]")
    exit(1)
}

let point = CGPoint(x: xPos, y: yPos)

// 마우스 이동(호버 상태 반영)
guard let moveEvent = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                              mouseCursorPosition: point, mouseButton: .left)
else {
    print("error: CGEvent(mouseMoved) 생성 실패")
    exit(1)
}

moveEvent.post(tap: .cghidEventTap)
usleep(150_000)

if args.count >= 5, args[3] == "scroll", let deltaY = Int32(args[4]) {
    guard let scrollEvent = CGEvent(scrollWheelEvent2Source: nil, units: .line,
                                    wheelCount: 1, wheel1: deltaY, wheel2: 0, wheel3: 0)
    else {
        print("error: CGEvent(scroll) 생성 실패")
        exit(1)
    }
    scrollEvent.location = point
    scrollEvent.post(tap: .cghidEventTap)
    exit(0)
}

func clickOnce(state: Int64) {
    guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                             mouseCursorPosition: point, mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                         mouseCursorPosition: point, mouseButton: .left)
    else {
        print("error: CGEvent(click) 생성 실패")
        exit(1)
    }
    down.setIntegerValueField(.mouseEventClickState, value: state)
    up.setIntegerValueField(.mouseEventClickState, value: state)
    down.post(tap: .cghidEventTap)
    usleep(80000)
    up.post(tap: .cghidEventTap)
}

clickOnce(state: 1)
if args.count >= 4, args[3] == "double" {
    usleep(120_000)
    clickOnce(state: 2)
}
