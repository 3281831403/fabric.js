import type { FabricObject } from '../../shapes/Object/FabricObject';
import type {
  Abortable,
  Constructor,
  TCrossOrigin,
  TFiller,
} from '../../typedefs';
import { createImage } from './dom';
import { classRegistry } from '../../ClassRegistry';
import type { BaseFilter } from '../../filters/BaseFilter';
import type { FabricObject as BaseFabricObject } from '../../shapes/Object/Object';
import {
  FabricError,
  ResourceSkippedError,
  SignalAbortedError,
} from '../internals/console';
import type { Shadow } from '../../Shadow';

export type LoadImageOptions = Abortable & {
  /**
   * cors value for the image loading, default to anonymous
   */
  crossOrigin?: TCrossOrigin;
};

/**
 * Loads image element from given url and resolve it, or catch.
 * @param {String} url URL representing an image
 * @param {LoadImageOptions} [options] image loading options
 * @returns {Promise<HTMLImageElement>} the loaded image.
 */
export const loadImage = (
  url: string,
  { signal, crossOrigin = null, resourceValidator }: LoadImageOptions = {},
): Promise<HTMLImageElement> => {
  if (signal && signal.aborted) {
    return Promise.reject(new SignalAbortedError('loadImage'));
  }
  if (url && resourceValidator) {
    return Promise.resolve()
      .then(() => resourceValidator(url))
      .then((isAllowed) => {
        if (!isAllowed) {
          throw new ResourceSkippedError(`Resource '${url}' is not allowed`);
        }
        if (signal && signal.aborted) {
          throw new SignalAbortedError('loadImage');
        }
        return loadImage(url, { signal, crossOrigin });
      });
  }
  return new Promise<HTMLImageElement>(function (resolve, reject) {
    if (signal && signal.aborted) {
      return reject(new SignalAbortedError('loadImage'));
    }
    const img = createImage();
    let abort: EventListenerOrEventListenerObject;
    if (signal) {
      abort = function (err: Event) {
        img.src = '';
        reject(err);
      };
      signal.addEventListener('abort', abort, { once: true });
    }
    const done = function () {
      img.onload = img.onerror = null;
      abort && signal?.removeEventListener('abort', abort);
      resolve(img);
    };
    if (!url) {
      done();
      return;
    }
    img.onload = done;
    img.onerror = function () {
      abort && signal?.removeEventListener('abort', abort);
      reject(new FabricError(`Error loading ${img.src}`));
    };
    crossOrigin && (img.crossOrigin = crossOrigin);
    img.src = url;
  });
};

type EnlivenedObject =
  | BaseFabricObject
  | FabricObject
  | BaseFilter<string>
  | Shadow
  | TFiller;

export type EnlivenObjectOptions<T extends EnlivenedObject = EnlivenedObject> =
  Abortable & {
    /**
     * Called after each object creation attempt.
     * Return a replacement instance when creation fails.
     */
    reviver?: (
      serializedObj: Record<string, any>,
      instance: T | undefined,
      error?: FabricError,
    ) => T | void | Promise<T | void>;
  };

/**
 * @TODO type this correctly.
 * Creates corresponding fabric instances from their object representations
 * @param {Object[]} objects Objects to enliven
 * @param {EnlivenObjectOptions} [options]
 * @param {(serializedObj: object, instance: FabricObject) => any} [options.reviver] Method for further parsing of object elements,
 * called after each fabric object created.
 * If an object can't be enlivened the reviver is called with the error and may return a replacement instance.
 * Without a reviver, an object that can't be enlivened rejects the entire promise.
 * Resources skipped by `resourceValidator` are omitted silently.
 * @param {AbortSignal} [options.signal] handle aborting, see https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal
 * @returns {Promise<FabricObject[]>}
 */
export const enlivenObjects = <T extends EnlivenedObject>(
  objects: any[],
  { signal, reviver, ...options }: EnlivenObjectOptions<NoInfer<T>> = {},
) => {
  if (signal && signal.aborted) {
    return Promise.reject(new SignalAbortedError('enlivenObjects'));
  }
  return new Promise<T[]>((resolve, reject) => {
    const instances: T[] = [];
    signal && signal.addEventListener('abort', reject, { once: true });
    Promise.allSettled(
      objects.map((obj) =>
        // resolve the class asynchronously so that an unregistered type
        // is treated as a per-object failure, same as any loading error
        Promise.resolve().then(() =>
          classRegistry
            .getClass<
              Constructor<T> & {
                fromObject(
                  options: any,
                  context: EnlivenObjectOptions<NoInfer<T>>,
                ): Promise<T>;
              }
            >(obj.type)
            .fromObject(obj, { signal, reviver, ...options }),
        ),
      ),
    )
      .then(async (elementsResult) => {
        for (const [index, result] of elementsResult.entries()) {
          if (result.status === 'fulfilled') {
            instances.push(result.value);
            reviver && (await reviver(objects[index], result.value));
          } else if (reviver) {
            const fallback = await reviver(
              objects[index],
              undefined,
              result.reason,
            );
            if (fallback) {
              instances.push(fallback);
            }
          } else if (!(result.reason instanceof ResourceSkippedError)) {
            // without a reviver a bad object rejects the entire load
            throw result.reason;
          }
        }
        resolve(instances);
      })
      .catch((error) => {
        // cleanup
        instances.forEach((instance) => {
          (instance as FabricObject).dispose &&
            (instance as FabricObject).dispose();
        });
        reject(error);
      })
      .finally(() => {
        signal && signal.removeEventListener('abort', reject);
      });
  });
};

/**
 * Creates corresponding fabric instances residing in an object, e.g. `clipPath`
 * @param {Object} object with properties to enlive ( fill, stroke, clipPath, path )
 * @param {object} [options]
 * @param {(serializedObj: object, instance: FabricObject) => any} [options.reviver] Method for further parsing of object elements,
 * called after each fabric object created, see {@link enlivenObjects}
 * @param {AbortSignal} [options.signal] handle aborting, see https://developer.mozilla.org/en-US/docs/Web/API/AbortController/signal
 * @returns {Promise<Record<string, FabricObject | TFiller | null>>} the input object with enlived values
 */
export const enlivenObjectEnlivables = <
  R = Record<string, FabricObject | TFiller | null>,
>(
  serializedObject: any,
  { signal, reviver, ...options }: EnlivenObjectOptions<any> = {},
) => {
  if (signal && signal.aborted) {
    return Promise.reject(new SignalAbortedError('enlivenObjectEnlivables'));
  }
  return new Promise<R>((resolve, reject) => {
    const instances: (FabricObject | TFiller | Shadow)[] = [];
    signal && signal.addEventListener('abort', reject, { once: true });
    // enlive every possible property
    const promises = Object.values(serializedObject).map((value: any) => {
      if (!value) {
        return value;
      }
      /**
       * clipPath or shadow or gradient or text on a path or a pattern,
       * or the backgroundImage or overlayImage of canvas
       * A typed value must correspond to a registered class.
       * A value that can't be enlivened follows the same policy as any other
       * bad object (reviver fallback or rejection) and is never left as raw JSON.
       * */
      if (value.type) {
        return enlivenObjects<FabricObject | Shadow | TFiller>([value], {
          signal,
          reviver,
          ...options,
        }).then(([enlived]) => {
          enlived && instances.push(enlived);
          return enlived;
        });
      }
      return value;
    });
    const keys = Object.keys(serializedObject);
    Promise.all(promises)
      .then((enlived) => {
        return enlived.reduce((acc, instance, index) => {
          acc[keys[index]] = instance;
          return acc;
        }, {});
      })
      .then(resolve)
      .catch((error) => {
        // cleanup
        instances.forEach((instance: any) => {
          instance.dispose && instance.dispose();
        });
        reject(error);
      })
      .finally(() => {
        signal && signal.removeEventListener('abort', reject);
      });
  });
};
