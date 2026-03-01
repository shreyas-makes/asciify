import type { SVGAttributes } from "react"

export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
  return (
    <svg
      viewBox="0 0 220 48"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Logo"
      {...props}
    >
      <text
        x="110"
        y="31"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="22"
      >
        {"¯\\_(ツ)_/¯"}
      </text>
    </svg>
  )
}
