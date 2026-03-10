import { useMemo } from 'react'
import { GeoShapeGeoStyle, useValue } from 'tldraw'
import type { Editor, TLImageShape } from 'tldraw'
import { getSelectionImagineSourceImage, resolveAssistantMode } from '../../../lib/workbenchGeneration'
import { getPageBounds, getScreenBounds, getSingleSelectedImage, isGeneratorShape } from '../helpers'

export function useWorkbenchSelectionState(editor: Editor) {
  const currentToolId = useValue(
    'workbench-current-tool',
    () => String(editor.getCurrentToolId()).split('.')[0],
    [editor]
  )

  const currentGeo = useValue(
    'workbench-current-geo',
    () => editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle),
    [editor]
  )

  const zoomPercent = useValue(
    'workbench-zoom-percent',
    () => Math.max(1, Math.round(editor.getZoomLevel() * 100)),
    [editor]
  )

  const selectionState = useValue(
    'workbench-selection-state',
    () => {
      const selectedShapes = editor.getSelectedShapes()
      const selectedImageShapes = selectedShapes.filter(
        (shape): shape is TLImageShape => shape.type === 'image'
      )
      const selectedShapeIds = editor.getSelectedShapeIds()
      const onlySelectedShape = editor.getOnlySelectedShape()
      const selectedImage = getSingleSelectedImage(onlySelectedShape)
      const selectedCount = selectedShapeIds.length
      const hasAnySelectedImage = selectedImageShapes.length > 0
      const firstSelectedImage = getSelectionImagineSourceImage(
        selectedImageShapes.flatMap((imageShape) => [
          {
            shapeId: imageShape.id,
            width: imageShape.props.w,
            height: imageShape.props.h,
            isGenerator: isGeneratorShape(imageShape),
          },
        ])
      )
      const hasSelectedGeneratorCard = selectedShapes.some(
        (shape) => shape.type === 'image' && isGeneratorShape(shape as TLImageShape)
      )
      const isLocked = Boolean(selectedImage?.isLocked)
      const isGeneratorCard = isGeneratorShape(selectedImage)
      const assistantMode = resolveAssistantMode({
        selectedCount,
        hasAnySelectedImage,
        singleSelectedImageIsLocked: isLocked,
        singleSelectedImageIsGenerator: isGeneratorCard,
      })
      const canEditSingleImage = assistantMode === 'image-edit' && Boolean(selectedImage)
      const canShowFloatingActions =
        canEditSingleImage && editor.isInAny('select.idle', 'select.pointing_shape')
      const canImagineSelection =
        assistantMode === 'selection-imagine' &&
        Boolean(firstSelectedImage) &&
        !hasSelectedGeneratorCard &&
        editor.isInAny('select.idle', 'select.pointing_shape')
      const selectionBounds =
        selectedCount > 0 ? getScreenBounds(editor.getSelectionScreenBounds()) : null
      const selectionPageBounds =
        selectedCount > 0 ? getPageBounds(editor.getSelectionPageBounds()) : null

      return {
        selectedShapeIds,
        selectedImageShapeIds: selectedImageShapes.map((shape) => shape.id),
        selectedCount,
        selectedImageCount: selectedImageShapes.length,
        hasAnySelectedImage,
        firstSelectedImage,
        hasSelectedGeneratorCard,
        selectedImage,
        isLocked,
        isGeneratorCard,
        assistantMode,
        canEditSingleImage,
        canShowFloatingActions,
        canImagineSelection,
        selectionBounds,
        selectionPageBounds,
      }
    },
    [editor]
  )

  const selectedImage = selectionState.selectedImage
  const assistantMode = selectionState.assistantMode
  const selectedShapeIdsKey = useMemo(
    () => selectionState.selectedShapeIds.join(','),
    [selectionState.selectedShapeIds]
  )
  const selectedGeneratorImage = assistantMode === 'image-generator' ? selectedImage : null
  const selectedChatImage = useMemo(() => {
    if (selectedImage && !selectionState.isGeneratorCard) {
      return selectedImage
    }

    if (selectionState.firstSelectedImage?.shapeId) {
      const shape = editor.getShape<TLImageShape>(
        selectionState.firstSelectedImage.shapeId as TLImageShape['id']
      )
      if (shape && !isGeneratorShape(shape)) {
        return shape
      }
    }

    return null
  }, [editor, selectedImage, selectionState.firstSelectedImage, selectionState.isGeneratorCard])

  const selectedSidebarImage =
    assistantMode === 'image-edit' || assistantMode === 'disabled' ? selectedImage : null
  const selectionNeedsImagineImage =
    assistantMode === 'disabled' &&
    selectionState.selectedCount > 1 &&
    !selectionState.hasAnySelectedImage

  return {
    currentToolId,
    currentGeo,
    zoomPercent,
    selectionState,
    selectedImage,
    assistantMode,
    selectedShapeIdsKey,
    selectedGeneratorImage,
    selectedChatImage,
    selectedSidebarImage,
    selectionNeedsImagineImage,
  }
}
