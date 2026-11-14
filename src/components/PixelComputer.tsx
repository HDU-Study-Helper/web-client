/** Small code-native pixel illustration, shared by the brand and assistant. */
export default function PixelComputer({
  happy = false,
  className = '',
}: {
  happy?: boolean
  className?: string
}) {
  return (
    <svg
      className={`pixel-computer ${className}`}
      viewBox="0 0 80 78"
      fill="none"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        d="M13 7h48v3h5v43h-5v4H13v-4H8V12h5V7Z"
        fill="#ded8c5"
        stroke="#24334a"
        strokeWidth="1.5"
      />
      <path d="M14 9h46v3H14V9ZM10 14h3v36h-3V14Z" fill="#fff9e9" />
      <path d="M18 14h39v34H18z" fill="#26384d" stroke="#122238" strokeWidth="2" />
      <path d="M21 17h33v2H21zM21 19h2v25h-2z" fill="#52667b" />
      {happy ? (
        <g fill="#f7f0d9">
          <path d="M28 26h4v5h-4zM44 26h4v5h-4zM29 36h3v3h-3zM32 39h12v3H32zM44 36h3v3h-3z" />
        </g>
      ) : (
        <path d="m27 25 6 5-6 5m11 2h9" stroke="#f7f0d9" strokeWidth="2" />
      )}
      <path
        d="M21 53h27v3H21zM30 58v4h19v-4M10 63h53v3h5v8H5v-8h5v-3Z"
        fill="#e8e0ca"
        stroke="#24334a"
        strokeWidth="1.5"
      />
      <path
        d="M12 67h5m3 0h5m3 0h5m3 0h5m3 0h5m3 0h5M11 71h30m7 0h11"
        stroke="#536076"
        strokeWidth="1.5"
      />
      <path d="M68 18h5m-3-6 3-3m-4 19 5 3" stroke="#536076" strokeWidth="1.5" />
    </svg>
  )
}
