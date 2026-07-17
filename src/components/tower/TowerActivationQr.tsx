'use client'

import { QRCodeSVG } from 'qrcode.react'

type Props = {
  payload: string
}

export default function TowerActivationQr({ payload }: Props) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-2xl shadow-black/30 sm:p-7">
      <QRCodeSVG
        value={payload}
        size={360}
        level="H"
        marginSize={1}
        className="h-auto w-full"
      />
    </div>
  )
}
