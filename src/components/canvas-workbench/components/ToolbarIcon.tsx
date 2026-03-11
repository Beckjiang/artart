import {
  ArrowRight,
  Frame,
  Image,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  Sparkles,
  Type,
} from 'lucide-react'
import type { ToolIconId } from '../types'

export function ToolbarIcon({ icon }: { icon: ToolIconId }) {
  const commonProps = { size: 18, 'aria-hidden': true }

  switch (icon) {
    case 'select':
      return <MousePointer2 {...commonProps} />
    case 'frame':
      return <Frame {...commonProps} />
    case 'rectangle':
      return <RectangleHorizontal {...commonProps} />
    case 'arrow':
      return <ArrowRight {...commonProps} />
    case 'text':
      return <Type {...commonProps} />
    case 'draw':
      return <Pencil {...commonProps} />
    case 'asset':
      return <Image {...commonProps} />
    case 'generator':
      return <Sparkles {...commonProps} />
    default:
      return null
  }
}
