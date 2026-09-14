// Adapted from https://github.com/vercel/ai-elements
// (packages/elements/src/shimmer.tsx). The upstream version animates the
// gradient sweep via the `motion` library; this uses a plain CSS keyframe
// (see .text-shimmer in src/input.css) instead, to avoid adding a whole
// animation library for one shimmering label. Public API (children/as/
// className/duration) is unchanged.
import type { ElementType } from "react"
import { memo } from "react"

import { cn } from "../lib/utils"

export interface TextShimmerProps {
  children: string
  as?: ElementType
  className?: string
  duration?: number
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
}: TextShimmerProps) => {
  return (
    <Component
      className={cn("text-shimmer inline-block", className)}
      style={{ animationDuration: `${duration}s` }}
    >
      {children}
    </Component>
  )
}

export const Shimmer = memo(ShimmerComponent)
