import { Eraser, Layers, Pencil, Sparkles, Trash2, Type, Wand2 } from 'lucide-react'
import { resolveGeminiImageDefaults } from '../../lib/imageGeneration'
import type { ImageAspectRatio, ImageGeneratorModel } from '../../lib/imageGeneration'
import type {
  AssistantActionPreset,
  ImageEditActionPreset,
  PresetDefinition,
  ToolItem,
} from './types'

export const INSERT_GAP = 40
export const MAX_TASKS = 16
export const DEFAULT_SIDEBAR_WIDTH = 360
export const MIN_SIDEBAR_WIDTH = 340
export const MAX_SIDEBAR_WIDTH = 560
export const MIN_WORKBENCH_CANVAS_WIDTH = 240
export const SIDEBAR_WIDTH_STORAGE_KEY = 'canvas.workbench.sidebar-width'
export const BOARD_TOUCH_DEBOUNCE = 1200
export const DEFAULT_GENERATOR_ASPECT_RATIO: ImageAspectRatio = '1:1'
export const {
  imageModel: DEFAULT_GENERATOR_IMAGE_MODEL,
  imageSize: DEFAULT_GENERATOR_IMAGE_SIZE,
} = resolveGeminiImageDefaults(import.meta.env)
export const GENERATOR_ROLE = 'image-generator'
export const GENERATOR_PLACEHOLDER_LABEL = 'Image Generator'
export const GENERATED_IMAGE_ROLE = 'generated-image'
export const TASK_TARGET_REMOVED = 'TASK_TARGET_REMOVED'
export const SELECTION_IMAGINE_PROMPT = '根据图片标注信息生成图片'
export const MASK_BRUSH_SIZES = [8, 16, 24, 32] as const

export const IMAGE_GENERATOR_MODEL_LABELS: Record<ImageGeneratorModel, string> = {
  'gemini-3-pro-image-preview': 'Gemini 3 Pro',
  'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash',
}

export const ACTION_PRESETS: Record<AssistantActionPreset, PresetDefinition> = {
  'text-to-image': {
    label: '文字生图',
    icon: Sparkles,
    helper: '不使用参考图，直接根据提示词生成并插入一张新图片。',
    defaultPrompt: '',
    placeholder: 'Describe what you want to create today',
  },
  'imagine-selection': {
    label: '想象',
    icon: Wand2,
    helper: '将当前多选元素合成为一张参考图，再生成新的融合结果。',
    defaultPrompt: SELECTION_IMAGINE_PROMPT,
    placeholder: SELECTION_IMAGINE_PROMPT,
  },
  'quick-edit': {
    label: '快速编辑',
    icon: Pencil,
    helper: '自由描述想修改的内容，保持现有图像作为参考。',
    defaultPrompt: '',
    placeholder: '描述想如何编辑这张图片，例如：增强立体感、调整配色、让 logo 更适合面试封面。',
  },
  'remove-bg': {
    label: '去除背景',
    icon: Eraser,
    helper: '去除背景并保留主体，适合快速做纯底或透明感素材。',
    defaultPrompt: '请去除这张图片的背景并保留主体，保持主体边缘自然清晰，输出干净简洁的背景效果。',
    placeholder: '补充你的背景处理要求，例如：纯白背景、透明背景、电商主图风格。',
  },
  'remove-object': {
    label: '移除对象',
    icon: Trash2,
    helper: '移除干扰元素并自动补全背景。',
    defaultPrompt: '请移除图片中的指定对象或干扰元素，并自然补全背景与纹理，保持整体风格一致。需要移除的对象：',
    placeholder: '说明要移除什么，例如：右上角文字、水印、多余人物、背景杂物。',
  },
  'edit-elements': {
    label: '编辑元素',
    icon: Layers,
    helper: '保持风格不变，替换或修改局部元素。',
    defaultPrompt: '请保持整体风格和构图，按以下要求修改或替换局部元素，使结果自然协调：',
    placeholder: '说明要替换或新增的元素，例如：把背景改成极简灰色、把图标换成几何风。',
  },
  'edit-text': {
    label: '编辑文字',
    icon: Type,
    helper: '保持版式和视觉风格，修改图片中的文字内容。',
    defaultPrompt: '请保持原有版式与视觉风格，按以下要求修改图片中的文字内容，并保证字体和排版自然统一：',
    placeholder: '输入新的文案要求，例如：将主标题改成“Realtime Copilot”。',
  },
}

export const IMAGE_EDIT_PRESETS: ImageEditActionPreset[] = [
  'quick-edit',
  'remove-bg',
  'remove-object',
  'edit-elements',
  'edit-text',
]

export const TOOL_ITEMS: ToolItem[] = [
  { id: 'select', label: '选择', icon: 'select' },
  { id: 'frame', label: '画框', icon: 'frame' },
  { id: 'rectangle', label: '矩形', icon: 'rectangle' },
  { id: 'arrow', label: '箭头', icon: 'arrow' },
  { id: 'text', label: '文本', icon: 'text' },
  { id: 'draw', label: '画笔', icon: 'draw' },
  { id: 'asset', label: '媒体', icon: 'asset' },
]
