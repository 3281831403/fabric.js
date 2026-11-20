import { Point, ZERO } from '../../Point';
import type { Group } from '../../shapes/Group';
import type { FabricObject } from '../../shapes/Object/FabricObject';
import { multiplyTransformMatrixArray } from '../../util/misc/matrix';
import { sizeAfterTransform } from '../../util/misc/objectTransforms';
import {
  calcPlaneChangeMatrix,
  sendVectorToPlane,
} from '../../util/misc/planeChange';

/**
 * @returns 2 points, the tl and br corners of the non rotated bounding box of an object
 * in the {@link group} plane, taking into account objects that {@link group} is their parent
 * but also belong to the active selection.
 */
export const getObjectBounds = (
  destinationGroup: Group,
  object: FabricObject,
): Point[] => {
  const {
    strokeUniform,
    strokeWidth,
    width,
    height,
    group: currentGroup,
  } = object;
  const t =
    currentGroup && currentGroup !== destinationGroup
      ? calcPlaneChangeMatrix(
          currentGroup.calcTransformMatrix(),
          destinationGroup.calcTransformMatrix(),
        )
      : null;
  const objectCenter = t
    ? object.getRelativeCenterPoint().transform(t)
    : object.getRelativeCenterPoint();
  const accountForStroke = !object['isStrokeAccountedForInDimensions']();

  // Uniform strokes are constant on screen, also across scaled ancestor
  // groups. Gather the uniform stroke carried by the object itself plus the
  // ones carried by its descendants (the latter are already included in the
  // width/height of a group and therefore have to be removed before scaling).
  const ownUniformStroke =
    strokeUniform && accountForStroke
      ? new Point(strokeWidth, strokeWidth)
      : ZERO;
  const nestedUniformStroke = object['_getNestedUniformStroke']();
  const strokeUniformVector = sendVectorToPlane(
    ownUniformStroke.add(nestedUniformStroke),
    undefined,
    t ?? currentGroup?.calcOwnMatrix(),
  );
  const scalingStrokeWidth =
    !strokeUniform && accountForStroke ? strokeWidth : 0;
  const sizeVector = sizeAfterTransform(
    width + scalingStrokeWidth - nestedUniformStroke.x,
    height + scalingStrokeWidth - nestedUniformStroke.y,
    multiplyTransformMatrixArray([t, object.calcOwnMatrix()], true),
  )
    .add(strokeUniformVector)
    .scalarDivide(2);
  return [objectCenter.subtract(sizeVector), objectCenter.add(sizeVector)];
};
