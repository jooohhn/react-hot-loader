import { getIdByType, getProxyByType, isColdType, isRegisteredComponent, updateProxyById } from './proxies';
import { hotComparisonOpen } from '../global/generation';
import { isForwardType, isMemoType, isReactClass, isReloadableComponent } from '../internal/reactUtils';
import { areSwappable } from './utils';
import { PROXY_KEY, UNWRAP_PROXY } from '../proxy';
import { resolveType } from './resolver';
import logger from '../logger';

const getInnerComponentType = component => {
  const unwrapper = component[UNWRAP_PROXY];
  return unwrapper ? unwrapper() : component;
};

const compareRegistered = (a, b) => {
  if (isRegisteredComponent(a) || isRegisteredComponent(b)) {
    if (resolveType(a) !== resolveType(b)) {
      return false;
    }
  }
  return true;
};

const compareComponents = (oldType, newType, setNewType, baseType) => {
  let defaultResult = oldType === newType;

  if ((oldType && !newType) || (!oldType && newType)) {
    return false;
  }

  if (isRegisteredComponent(oldType) || isRegisteredComponent(newType)) {
    if (!compareRegistered(oldType, newType)) {
      return false;
    }
    defaultResult = true;
  }

  if (isForwardType({ type: oldType }) && isForwardType({ type: newType })) {
    if (!compareRegistered(oldType.render, newType.render)) {
      return false;
    }
    if (oldType.render === newType.render || areSwappable(oldType.render, newType.render)) {
      setNewType(newType);
      return true;
    }
    return defaultResult;
  }

  if (isMemoType({ type: oldType }) && isMemoType({ type: newType })) {
    if (!compareRegistered(oldType.type, newType.type)) {
      return false;
    }
    if (oldType.type === newType.type || areSwappable(oldType.type, newType.type)) {
      if (baseType) {
        // memo form different fibers, why?
        if (baseType.$$typeof === newType.$$typeof) {
          setNewType(newType);
        } else {
          setNewType(newType.type);
        }
      } else {
        logger.warn('Please update hot-loader/react-dom');
        if (isReactClass(newType.type)) {
          setNewType(newType);
        } else {
          setNewType(newType.type);
        }
      }

      return true;
    }
    return defaultResult;
  }

  if (newType !== oldType && areSwappable(newType, oldType)) {
    const unwrapFactory = newType[UNWRAP_PROXY];
    const oldProxy = unwrapFactory && getProxyByType(unwrapFactory());
    if (oldProxy) {
      oldProxy.dereference();
      updateProxyById(oldType[PROXY_KEY] || getIdByType(oldType), getInnerComponentType(newType));
    } else {
      setNewType(newType);
    }
    return true;
  }

  return defaultResult;
};

const knownPairs = new WeakMap();
const emptyMap = new WeakMap();

export const hotComponentCompare = (oldType, newType, setNewType, baseType) => {
  const hotActive = hotComparisonOpen();
  let result = oldType === newType;

  if (
    !isReloadableComponent(oldType) ||
    !isReloadableComponent(newType) ||
    isColdType(oldType) ||
    isColdType(oldType) ||
    !oldType ||
    !newType ||
    0
  ) {
    return result;
  }

  // comparison should be active only if hot update window
  // or it would merge components it shall not
  if (hotActive) {
    result = compareComponents(oldType, newType, setNewType, baseType);
    const pair = knownPairs.get(oldType) || new WeakMap();
    pair.set(newType, result);
    knownPairs.set(oldType, pair);
    return result;
  }

  if (result) {
    return result;
  }

  const pair = knownPairs.get(oldType) || emptyMap;
  return pair.get(newType) || false;
};
