import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react'

export function useBottomSheetDrag(options: { enabled: boolean; onDismiss: () => void }) {
  const popupRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)

  const dragRef = useRef<{
    pointerId: number
    startOffset: number
    startTime: number
    startY: number
  } | null>(null)

  const suppressClickRef = useRef(false)

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [options.enabled])

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary) return

    const popup = popupRef.current
    const translate = popup ? getComputedStyle(popup).translate : ''
    const startOffset = readTranslateY(translate)

    clearFrame()

    if (popup) {
      popup.style.transition = 'none'
      popup.style.translate = translate === 'none' ? '' : translate
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startOffset,
      startTime: event.timeStamp,
      startY: event.clientY,
    }
    suppressClickRef.current = false

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    const popup = popupRef.current

    if (!drag || drag.pointerId !== event.pointerId || !popup) return

    const movement = event.clientY - drag.startY
    const offset = Math.max(0, drag.startOffset + movement)
    suppressClickRef.current ||= Math.abs(movement) > 4
    popup.style.translate = `0 ${offset}px`
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    const popup = popupRef.current

    if (!drag || drag.pointerId !== event.pointerId || !popup) return

    dragRef.current = null
    const movement = event.clientY - drag.startY
    const offset = Math.max(0, drag.startOffset + movement)

    if (Math.abs(movement) <= 4) {
      restore(popup, drag.startOffset)

      return
    }

    const velocity = Math.max(0, movement) / Math.max(event.timeStamp - drag.startTime, 1)
    const dismiss = offset > Math.min(96, popup.offsetHeight * 0.2) || velocity > 0.55

    if (dismiss) {
      dismissSheet(popup)

      return
    }

    restore(popup, offset)
  }

  function cancelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return

    dragRef.current = null
    const popup = popupRef.current

    if (!popup) return
    restore(popup, readTranslateY(popup.style.translate))
  }

  function close() {
    const popup = popupRef.current

    if (popup && freeze(popup) > 0) {
      dismissSheet(popup)

      return
    }

    options.onDismiss()
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false

      return
    }

    close()
  }

  function restore(popup: HTMLDivElement, offset: number) {
    if (offset <= 4) {
      popup.style.translate = ''
      popup.style.transition = ''

      return
    }

    releaseStyles(popup)
  }

  function clearFrame() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }

  function releaseStyles(popup: HTMLDivElement) {
    clearFrame()

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      popup.style.transition = ''
      popup.style.translate = ''
    })
  }

  function dismissSheet(popup: HTMLDivElement) {
    options.onDismiss()
    releaseStyles(popup)
  }

  function freeze(popup: HTMLDivElement) {
    const translate = getComputedStyle(popup).translate
    const offset = readTranslateY(translate)

    if (offset <= 0) return 0

    clearFrame()
    popup.style.transition = 'none'
    popup.style.translate = translate === 'none' ? '' : translate

    return offset
  }

  return {
    popupRef,
    close,
    handleProps: {
      onClick: handleClick,
      onPointerDown: beginDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: cancelDrag,
    },
  }
}

function readTranslateY(translate: string) {
  if (translate.length === 0 || translate === 'none') return 0

  const value = translate.trim().split(/\s+/).at(-1)

  return Number.parseFloat(value ?? '0') || 0
}
