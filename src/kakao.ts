export interface Coordinate {
  getLat(): number
  getLng(): number
}
export interface Bounds {
  extend(point: Coordinate): void
  getSouthWest(): Coordinate
  getNorthEast(): Coordinate
}
export interface KakaoMap {
  panTo(point: Coordinate): void
  setBounds(
    bounds: Bounds,
    top?: number,
    right?: number,
    bottom?: number,
    left?: number,
  ): void
  getLevel(): number
  getBounds(): Bounds
  getCenter(): Coordinate
  setLevel(level: number): void
  relayout(): void
}
export interface MapLayer {
  setMap(map: KakaoMap | null): void
  setZIndex?(index: number): void
}
export interface KakaoMaps {
  event: {
    addListener(map: KakaoMap, event: 'idle', callback: () => void): void
    removeListener(map: KakaoMap, event: 'idle', callback: () => void): void
  }
  load(callback: () => void): void
  LatLng: new (lat: number, lng: number) => Coordinate
  LatLngBounds: new () => Bounds
  Map: new (
    element: HTMLElement,
    options: { center: Coordinate; level: number },
  ) => KakaoMap
  CustomOverlay: new (options: {
    map: KakaoMap
    position: Coordinate
    content: HTMLElement
    yAnchor: number
    zIndex: number
  }) => MapLayer
  Polyline: new (options: {
    map: KakaoMap
    path: Coordinate[]
    strokeWeight: number
    strokeColor: string
    strokeOpacity: number
    strokeStyle?: 'shortdash' | 'shortdot'
  }) => MapLayer
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}

let sdkPromise: Promise<KakaoMaps> | null = null

export function loadKakaoMaps(key: string): Promise<KakaoMaps> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(() => {
      script.remove()
      reject(new Error('Map SDK timeout'))
    }, 12000)
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      script.remove()
      reject(new Error('Map SDK unavailable'))
    }
    script.onload = () => {
      const maps = window.kakao?.maps
      if (!maps) {
        window.clearTimeout(timer)
        reject(new Error('Map SDK missing'))
        return
      }
      maps.load(() => {
        window.clearTimeout(timer)
        resolve(maps)
      })
    }
    document.head.appendChild(script)
  })
  sdkPromise.catch(() => {
    sdkPromise = null
  })
  return sdkPromise
}
