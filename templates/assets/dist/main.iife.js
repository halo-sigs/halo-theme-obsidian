var main = function(exports) {
  "use strict";
  var flushPending = false;
  var flushing = false;
  var queue = [];
  var lastFlushedIndex = -1;
  function scheduler(callback) {
    queueJob(callback);
  }
  function queueJob(job) {
    if (!queue.includes(job))
      queue.push(job);
    queueFlush();
  }
  function dequeueJob(job) {
    let index2 = queue.indexOf(job);
    if (index2 !== -1 && index2 > lastFlushedIndex)
      queue.splice(index2, 1);
  }
  function queueFlush() {
    if (!flushing && !flushPending) {
      flushPending = true;
      queueMicrotask(flushJobs);
    }
  }
  function flushJobs() {
    flushPending = false;
    flushing = true;
    for (let i = 0; i < queue.length; i++) {
      queue[i]();
      lastFlushedIndex = i;
    }
    queue.length = 0;
    lastFlushedIndex = -1;
    flushing = false;
  }
  var reactive;
  var effect;
  var release;
  var raw;
  var shouldSchedule = true;
  function disableEffectScheduling(callback) {
    shouldSchedule = false;
    callback();
    shouldSchedule = true;
  }
  function setReactivityEngine(engine) {
    reactive = engine.reactive;
    release = engine.release;
    effect = (callback) => engine.effect(callback, { scheduler: (task) => {
      if (shouldSchedule) {
        scheduler(task);
      } else {
        task();
      }
    } });
    raw = engine.raw;
  }
  function overrideEffect(override) {
    effect = override;
  }
  function elementBoundEffect(el) {
    let cleanup2 = () => {
    };
    let wrappedEffect = (callback) => {
      let effectReference = effect(callback);
      if (!el._x_effects) {
        el._x_effects = /* @__PURE__ */ new Set();
        el._x_runEffects = () => {
          el._x_effects.forEach((i) => i());
        };
      }
      el._x_effects.add(effectReference);
      cleanup2 = () => {
        if (effectReference === void 0)
          return;
        el._x_effects.delete(effectReference);
        release(effectReference);
      };
      return effectReference;
    };
    return [wrappedEffect, () => {
      cleanup2();
    }];
  }
  var onAttributeAddeds = [];
  var onElRemoveds = [];
  var onElAddeds = [];
  function onElAdded(callback) {
    onElAddeds.push(callback);
  }
  function onElRemoved(el, callback) {
    if (typeof callback === "function") {
      if (!el._x_cleanups)
        el._x_cleanups = [];
      el._x_cleanups.push(callback);
    } else {
      callback = el;
      onElRemoveds.push(callback);
    }
  }
  function onAttributesAdded(callback) {
    onAttributeAddeds.push(callback);
  }
  function onAttributeRemoved(el, name, callback) {
    if (!el._x_attributeCleanups)
      el._x_attributeCleanups = {};
    if (!el._x_attributeCleanups[name])
      el._x_attributeCleanups[name] = [];
    el._x_attributeCleanups[name].push(callback);
  }
  function cleanupAttributes(el, names) {
    if (!el._x_attributeCleanups)
      return;
    Object.entries(el._x_attributeCleanups).forEach(([name, value]) => {
      if (names === void 0 || names.includes(name)) {
        value.forEach((i) => i());
        delete el._x_attributeCleanups[name];
      }
    });
  }
  var observer = new MutationObserver(onMutate);
  var currentlyObserving = false;
  function startObservingMutations() {
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeOldValue: true });
    currentlyObserving = true;
  }
  function stopObservingMutations() {
    flushObserver();
    observer.disconnect();
    currentlyObserving = false;
  }
  var recordQueue = [];
  var willProcessRecordQueue = false;
  function flushObserver() {
    recordQueue = recordQueue.concat(observer.takeRecords());
    if (recordQueue.length && !willProcessRecordQueue) {
      willProcessRecordQueue = true;
      queueMicrotask(() => {
        processRecordQueue();
        willProcessRecordQueue = false;
      });
    }
  }
  function processRecordQueue() {
    onMutate(recordQueue);
    recordQueue.length = 0;
  }
  function mutateDom(callback) {
    if (!currentlyObserving)
      return callback();
    stopObservingMutations();
    let result = callback();
    startObservingMutations();
    return result;
  }
  var isCollecting = false;
  var deferredMutations = [];
  function deferMutations() {
    isCollecting = true;
  }
  function flushAndStopDeferringMutations() {
    isCollecting = false;
    onMutate(deferredMutations);
    deferredMutations = [];
  }
  function onMutate(mutations) {
    if (isCollecting) {
      deferredMutations = deferredMutations.concat(mutations);
      return;
    }
    let addedNodes = [];
    let removedNodes = [];
    let addedAttributes = /* @__PURE__ */ new Map();
    let removedAttributes = /* @__PURE__ */ new Map();
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].target._x_ignoreMutationObserver)
        continue;
      if (mutations[i].type === "childList") {
        mutations[i].addedNodes.forEach((node) => node.nodeType === 1 && addedNodes.push(node));
        mutations[i].removedNodes.forEach((node) => node.nodeType === 1 && removedNodes.push(node));
      }
      if (mutations[i].type === "attributes") {
        let el = mutations[i].target;
        let name = mutations[i].attributeName;
        let oldValue = mutations[i].oldValue;
        let add2 = () => {
          if (!addedAttributes.has(el))
            addedAttributes.set(el, []);
          addedAttributes.get(el).push({ name, value: el.getAttribute(name) });
        };
        let remove = () => {
          if (!removedAttributes.has(el))
            removedAttributes.set(el, []);
          removedAttributes.get(el).push(name);
        };
        if (el.hasAttribute(name) && oldValue === null) {
          add2();
        } else if (el.hasAttribute(name)) {
          remove();
          add2();
        } else {
          remove();
        }
      }
    }
    removedAttributes.forEach((attrs, el) => {
      cleanupAttributes(el, attrs);
    });
    addedAttributes.forEach((attrs, el) => {
      onAttributeAddeds.forEach((i) => i(el, attrs));
    });
    for (let node of removedNodes) {
      if (addedNodes.includes(node))
        continue;
      onElRemoveds.forEach((i) => i(node));
      if (node._x_cleanups) {
        while (node._x_cleanups.length)
          node._x_cleanups.pop()();
      }
    }
    addedNodes.forEach((node) => {
      node._x_ignoreSelf = true;
      node._x_ignore = true;
    });
    for (let node of addedNodes) {
      if (removedNodes.includes(node))
        continue;
      if (!node.isConnected)
        continue;
      delete node._x_ignoreSelf;
      delete node._x_ignore;
      onElAddeds.forEach((i) => i(node));
      node._x_ignore = true;
      node._x_ignoreSelf = true;
    }
    addedNodes.forEach((node) => {
      delete node._x_ignoreSelf;
      delete node._x_ignore;
    });
    addedNodes = null;
    removedNodes = null;
    addedAttributes = null;
    removedAttributes = null;
  }
  function scope(node) {
    return mergeProxies(closestDataStack(node));
  }
  function addScopeToNode(node, data2, referenceNode) {
    node._x_dataStack = [data2, ...closestDataStack(referenceNode || node)];
    return () => {
      node._x_dataStack = node._x_dataStack.filter((i) => i !== data2);
    };
  }
  function closestDataStack(node) {
    if (node._x_dataStack)
      return node._x_dataStack;
    if (typeof ShadowRoot === "function" && node instanceof ShadowRoot) {
      return closestDataStack(node.host);
    }
    if (!node.parentNode) {
      return [];
    }
    return closestDataStack(node.parentNode);
  }
  function mergeProxies(objects) {
    let thisProxy = new Proxy({}, {
      ownKeys: () => {
        return Array.from(new Set(objects.flatMap((i) => Object.keys(i))));
      },
      has: (target, name) => {
        return objects.some((obj) => obj.hasOwnProperty(name));
      },
      get: (target, name) => {
        return (objects.find((obj) => {
          if (obj.hasOwnProperty(name)) {
            let descriptor = Object.getOwnPropertyDescriptor(obj, name);
            if (descriptor.get && descriptor.get._x_alreadyBound || descriptor.set && descriptor.set._x_alreadyBound) {
              return true;
            }
            if ((descriptor.get || descriptor.set) && descriptor.enumerable) {
              let getter = descriptor.get;
              let setter = descriptor.set;
              let property = descriptor;
              getter = getter && getter.bind(thisProxy);
              setter = setter && setter.bind(thisProxy);
              if (getter)
                getter._x_alreadyBound = true;
              if (setter)
                setter._x_alreadyBound = true;
              Object.defineProperty(obj, name, {
                ...property,
                get: getter,
                set: setter
              });
            }
            return true;
          }
          return false;
        }) || {})[name];
      },
      set: (target, name, value) => {
        let closestObjectWithKey = objects.find((obj) => obj.hasOwnProperty(name));
        if (closestObjectWithKey) {
          closestObjectWithKey[name] = value;
        } else {
          objects[objects.length - 1][name] = value;
        }
        return true;
      }
    });
    return thisProxy;
  }
  function initInterceptors(data2) {
    let isObject2 = (val) => typeof val === "object" && !Array.isArray(val) && val !== null;
    let recurse = (obj, basePath = "") => {
      Object.entries(Object.getOwnPropertyDescriptors(obj)).forEach(([key, { value, enumerable }]) => {
        if (enumerable === false || value === void 0)
          return;
        let path = basePath === "" ? key : `${basePath}.${key}`;
        if (typeof value === "object" && value !== null && value._x_interceptor) {
          obj[key] = value.initialize(data2, path, key);
        } else {
          if (isObject2(value) && value !== obj && !(value instanceof Element)) {
            recurse(value, path);
          }
        }
      });
    };
    return recurse(data2);
  }
  function interceptor(callback, mutateObj = () => {
  }) {
    let obj = {
      initialValue: void 0,
      _x_interceptor: true,
      initialize(data2, path, key) {
        return callback(this.initialValue, () => get(data2, path), (value) => set(data2, path, value), path, key);
      }
    };
    mutateObj(obj);
    return (initialValue) => {
      if (typeof initialValue === "object" && initialValue !== null && initialValue._x_interceptor) {
        let initialize = obj.initialize.bind(obj);
        obj.initialize = (data2, path, key) => {
          let innerValue = initialValue.initialize(data2, path, key);
          obj.initialValue = innerValue;
          return initialize(data2, path, key);
        };
      } else {
        obj.initialValue = initialValue;
      }
      return obj;
    };
  }
  function get(obj, path) {
    return path.split(".").reduce((carry, segment) => carry[segment], obj);
  }
  function set(obj, path, value) {
    if (typeof path === "string")
      path = path.split(".");
    if (path.length === 1)
      obj[path[0]] = value;
    else if (path.length === 0)
      throw error;
    else {
      if (obj[path[0]])
        return set(obj[path[0]], path.slice(1), value);
      else {
        obj[path[0]] = {};
        return set(obj[path[0]], path.slice(1), value);
      }
    }
  }
  var magics = {};
  function magic(name, callback) {
    magics[name] = callback;
  }
  function injectMagics(obj, el) {
    Object.entries(magics).forEach(([name, callback]) => {
      let memoizedUtilities = null;
      function getUtilities() {
        if (memoizedUtilities) {
          return memoizedUtilities;
        } else {
          let [utilities, cleanup2] = getElementBoundUtilities(el);
          memoizedUtilities = { interceptor, ...utilities };
          onElRemoved(el, cleanup2);
          return memoizedUtilities;
        }
      }
      Object.defineProperty(obj, `$${name}`, {
        get() {
          return callback(el, getUtilities());
        },
        enumerable: false
      });
    });
    return obj;
  }
  function tryCatch(el, expression, callback, ...args) {
    try {
      return callback(...args);
    } catch (e) {
      handleError(e, el, expression);
    }
  }
  function handleError(error2, el, expression = void 0) {
    Object.assign(error2, { el, expression });
    console.warn(`Alpine Expression Error: ${error2.message}

${expression ? 'Expression: "' + expression + '"\n\n' : ""}`, el);
    setTimeout(() => {
      throw error2;
    }, 0);
  }
  var shouldAutoEvaluateFunctions = true;
  function dontAutoEvaluateFunctions(callback) {
    let cache = shouldAutoEvaluateFunctions;
    shouldAutoEvaluateFunctions = false;
    let result = callback();
    shouldAutoEvaluateFunctions = cache;
    return result;
  }
  function evaluate(el, expression, extras = {}) {
    let result;
    evaluateLater(el, expression)((value) => result = value, extras);
    return result;
  }
  function evaluateLater(...args) {
    return theEvaluatorFunction(...args);
  }
  var theEvaluatorFunction = normalEvaluator;
  function setEvaluator(newEvaluator) {
    theEvaluatorFunction = newEvaluator;
  }
  function normalEvaluator(el, expression) {
    let overriddenMagics = {};
    injectMagics(overriddenMagics, el);
    let dataStack = [overriddenMagics, ...closestDataStack(el)];
    let evaluator = typeof expression === "function" ? generateEvaluatorFromFunction(dataStack, expression) : generateEvaluatorFromString(dataStack, expression, el);
    return tryCatch.bind(null, el, expression, evaluator);
  }
  function generateEvaluatorFromFunction(dataStack, func) {
    return (receiver = () => {
    }, { scope: scope2 = {}, params = [] } = {}) => {
      let result = func.apply(mergeProxies([scope2, ...dataStack]), params);
      runIfTypeOfFunction(receiver, result);
    };
  }
  var evaluatorMemo = {};
  function generateFunctionFromString(expression, el) {
    if (evaluatorMemo[expression]) {
      return evaluatorMemo[expression];
    }
    let AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    let rightSideSafeExpression = /^[\n\s]*if.*\(.*\)/.test(expression) || /^(let|const)\s/.test(expression) ? `(async()=>{ ${expression} })()` : expression;
    const safeAsyncFunction = () => {
      try {
        return new AsyncFunction(["__self", "scope"], `with (scope) { __self.result = ${rightSideSafeExpression} }; __self.finished = true; return __self.result;`);
      } catch (error2) {
        handleError(error2, el, expression);
        return Promise.resolve();
      }
    };
    let func = safeAsyncFunction();
    evaluatorMemo[expression] = func;
    return func;
  }
  function generateEvaluatorFromString(dataStack, expression, el) {
    let func = generateFunctionFromString(expression, el);
    return (receiver = () => {
    }, { scope: scope2 = {}, params = [] } = {}) => {
      func.result = void 0;
      func.finished = false;
      let completeScope = mergeProxies([scope2, ...dataStack]);
      if (typeof func === "function") {
        let promise = func(func, completeScope).catch((error2) => handleError(error2, el, expression));
        if (func.finished) {
          runIfTypeOfFunction(receiver, func.result, completeScope, params, el);
          func.result = void 0;
        } else {
          promise.then((result) => {
            runIfTypeOfFunction(receiver, result, completeScope, params, el);
          }).catch((error2) => handleError(error2, el, expression)).finally(() => func.result = void 0);
        }
      }
    };
  }
  function runIfTypeOfFunction(receiver, value, scope2, params, el) {
    if (shouldAutoEvaluateFunctions && typeof value === "function") {
      let result = value.apply(scope2, params);
      if (result instanceof Promise) {
        result.then((i) => runIfTypeOfFunction(receiver, i, scope2, params)).catch((error2) => handleError(error2, el, value));
      } else {
        receiver(result);
      }
    } else if (typeof value === "object" && value instanceof Promise) {
      value.then((i) => receiver(i));
    } else {
      receiver(value);
    }
  }
  var prefixAsString = "x-";
  function prefix(subject = "") {
    return prefixAsString + subject;
  }
  function setPrefix(newPrefix) {
    prefixAsString = newPrefix;
  }
  var directiveHandlers = {};
  function directive(name, callback) {
    directiveHandlers[name] = callback;
    return {
      before(directive2) {
        if (!directiveHandlers[directive2]) {
          console.warn("Cannot find directive `${directive}`. `${name}` will use the default order of execution");
          return;
        }
        const pos = directiveOrder.indexOf(directive2);
        directiveOrder.splice(pos >= 0 ? pos : directiveOrder.indexOf("DEFAULT"), 0, name);
      }
    };
  }
  function directives(el, attributes, originalAttributeOverride) {
    attributes = Array.from(attributes);
    if (el._x_virtualDirectives) {
      let vAttributes = Object.entries(el._x_virtualDirectives).map(([name, value]) => ({ name, value }));
      let staticAttributes = attributesOnly(vAttributes);
      vAttributes = vAttributes.map((attribute) => {
        if (staticAttributes.find((attr) => attr.name === attribute.name)) {
          return {
            name: `x-bind:${attribute.name}`,
            value: `"${attribute.value}"`
          };
        }
        return attribute;
      });
      attributes = attributes.concat(vAttributes);
    }
    let transformedAttributeMap = {};
    let directives2 = attributes.map(toTransformedAttributes((newName, oldName) => transformedAttributeMap[newName] = oldName)).filter(outNonAlpineAttributes).map(toParsedDirectives(transformedAttributeMap, originalAttributeOverride)).sort(byPriority);
    return directives2.map((directive2) => {
      return getDirectiveHandler(el, directive2);
    });
  }
  function attributesOnly(attributes) {
    return Array.from(attributes).map(toTransformedAttributes()).filter((attr) => !outNonAlpineAttributes(attr));
  }
  var isDeferringHandlers = false;
  var directiveHandlerStacks = /* @__PURE__ */ new Map();
  var currentHandlerStackKey = Symbol();
  function deferHandlingDirectives(callback) {
    isDeferringHandlers = true;
    let key = Symbol();
    currentHandlerStackKey = key;
    directiveHandlerStacks.set(key, []);
    let flushHandlers = () => {
      while (directiveHandlerStacks.get(key).length)
        directiveHandlerStacks.get(key).shift()();
      directiveHandlerStacks.delete(key);
    };
    let stopDeferring = () => {
      isDeferringHandlers = false;
      flushHandlers();
    };
    callback(flushHandlers);
    stopDeferring();
  }
  function getElementBoundUtilities(el) {
    let cleanups = [];
    let cleanup2 = (callback) => cleanups.push(callback);
    let [effect3, cleanupEffect] = elementBoundEffect(el);
    cleanups.push(cleanupEffect);
    let utilities = {
      Alpine: alpine_default,
      effect: effect3,
      cleanup: cleanup2,
      evaluateLater: evaluateLater.bind(evaluateLater, el),
      evaluate: evaluate.bind(evaluate, el)
    };
    let doCleanup = () => cleanups.forEach((i) => i());
    return [utilities, doCleanup];
  }
  function getDirectiveHandler(el, directive2) {
    let noop = () => {
    };
    let handler4 = directiveHandlers[directive2.type] || noop;
    let [utilities, cleanup2] = getElementBoundUtilities(el);
    onAttributeRemoved(el, directive2.original, cleanup2);
    let fullHandler = () => {
      if (el._x_ignore || el._x_ignoreSelf)
        return;
      handler4.inline && handler4.inline(el, directive2, utilities);
      handler4 = handler4.bind(handler4, el, directive2, utilities);
      isDeferringHandlers ? directiveHandlerStacks.get(currentHandlerStackKey).push(handler4) : handler4();
    };
    fullHandler.runCleanups = cleanup2;
    return fullHandler;
  }
  var startingWith = (subject, replacement) => ({ name, value }) => {
    if (name.startsWith(subject))
      name = name.replace(subject, replacement);
    return { name, value };
  };
  var into = (i) => i;
  function toTransformedAttributes(callback = () => {
  }) {
    return ({ name, value }) => {
      let { name: newName, value: newValue } = attributeTransformers.reduce((carry, transform) => {
        return transform(carry);
      }, { name, value });
      if (newName !== name)
        callback(newName, name);
      return { name: newName, value: newValue };
    };
  }
  var attributeTransformers = [];
  function mapAttributes(callback) {
    attributeTransformers.push(callback);
  }
  function outNonAlpineAttributes({ name }) {
    return alpineAttributeRegex().test(name);
  }
  var alpineAttributeRegex = () => new RegExp(`^${prefixAsString}([^:^.]+)\\b`);
  function toParsedDirectives(transformedAttributeMap, originalAttributeOverride) {
    return ({ name, value }) => {
      let typeMatch = name.match(alpineAttributeRegex());
      let valueMatch = name.match(/:([a-zA-Z0-9\-:]+)/);
      let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || [];
      let original = originalAttributeOverride || transformedAttributeMap[name] || name;
      return {
        type: typeMatch ? typeMatch[1] : null,
        value: valueMatch ? valueMatch[1] : null,
        modifiers: modifiers.map((i) => i.replace(".", "")),
        expression: value,
        original
      };
    };
  }
  var DEFAULT = "DEFAULT";
  var directiveOrder = [
    "ignore",
    "ref",
    "data",
    "id",
    "bind",
    "init",
    "for",
    "model",
    "modelable",
    "transition",
    "show",
    "if",
    DEFAULT,
    "teleport"
  ];
  function byPriority(a, b) {
    let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type;
    let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type;
    return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB);
  }
  function dispatch(el, name, detail = {}) {
    el.dispatchEvent(new CustomEvent(name, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true
    }));
  }
  function walk(el, callback) {
    if (typeof ShadowRoot === "function" && el instanceof ShadowRoot) {
      Array.from(el.children).forEach((el2) => walk(el2, callback));
      return;
    }
    let skip = false;
    callback(el, () => skip = true);
    if (skip)
      return;
    let node = el.firstElementChild;
    while (node) {
      walk(node, callback);
      node = node.nextElementSibling;
    }
  }
  function warn(message, ...args) {
    console.warn(`Alpine Warning: ${message}`, ...args);
  }
  var started = false;
  function start() {
    if (started)
      warn("Alpine has already been initialized on this page. Calling Alpine.start() more than once can cause problems.");
    started = true;
    if (!document.body)
      warn("Unable to initialize. Trying to load Alpine before `<body>` is available. Did you forget to add `defer` in Alpine's `<script>` tag?");
    dispatch(document, "alpine:init");
    dispatch(document, "alpine:initializing");
    startObservingMutations();
    onElAdded((el) => initTree(el, walk));
    onElRemoved((el) => destroyTree(el));
    onAttributesAdded((el, attrs) => {
      directives(el, attrs).forEach((handle) => handle());
    });
    let outNestedComponents = (el) => !closestRoot(el.parentElement, true);
    Array.from(document.querySelectorAll(allSelectors())).filter(outNestedComponents).forEach((el) => {
      initTree(el);
    });
    dispatch(document, "alpine:initialized");
  }
  var rootSelectorCallbacks = [];
  var initSelectorCallbacks = [];
  function rootSelectors() {
    return rootSelectorCallbacks.map((fn) => fn());
  }
  function allSelectors() {
    return rootSelectorCallbacks.concat(initSelectorCallbacks).map((fn) => fn());
  }
  function addRootSelector(selectorCallback) {
    rootSelectorCallbacks.push(selectorCallback);
  }
  function addInitSelector(selectorCallback) {
    initSelectorCallbacks.push(selectorCallback);
  }
  function closestRoot(el, includeInitSelectors = false) {
    return findClosest(el, (element) => {
      const selectors = includeInitSelectors ? allSelectors() : rootSelectors();
      if (selectors.some((selector) => element.matches(selector)))
        return true;
    });
  }
  function findClosest(el, callback) {
    if (!el)
      return;
    if (callback(el))
      return el;
    if (el._x_teleportBack)
      el = el._x_teleportBack;
    if (!el.parentElement)
      return;
    return findClosest(el.parentElement, callback);
  }
  function isRoot(el) {
    return rootSelectors().some((selector) => el.matches(selector));
  }
  var initInterceptors2 = [];
  function interceptInit(callback) {
    initInterceptors2.push(callback);
  }
  function initTree(el, walker = walk, intercept = () => {
  }) {
    deferHandlingDirectives(() => {
      walker(el, (el2, skip) => {
        intercept(el2, skip);
        initInterceptors2.forEach((i) => i(el2, skip));
        directives(el2, el2.attributes).forEach((handle) => handle());
        el2._x_ignore && skip();
      });
    });
  }
  function destroyTree(root) {
    walk(root, (el) => cleanupAttributes(el));
  }
  var tickStack = [];
  var isHolding = false;
  function nextTick(callback = () => {
  }) {
    queueMicrotask(() => {
      isHolding || setTimeout(() => {
        releaseNextTicks();
      });
    });
    return new Promise((res) => {
      tickStack.push(() => {
        callback();
        res();
      });
    });
  }
  function releaseNextTicks() {
    isHolding = false;
    while (tickStack.length)
      tickStack.shift()();
  }
  function holdNextTicks() {
    isHolding = true;
  }
  function setClasses(el, value) {
    if (Array.isArray(value)) {
      return setClassesFromString(el, value.join(" "));
    } else if (typeof value === "object" && value !== null) {
      return setClassesFromObject(el, value);
    } else if (typeof value === "function") {
      return setClasses(el, value());
    }
    return setClassesFromString(el, value);
  }
  function setClassesFromString(el, classString) {
    let missingClasses = (classString2) => classString2.split(" ").filter((i) => !el.classList.contains(i)).filter(Boolean);
    let addClassesAndReturnUndo = (classes) => {
      el.classList.add(...classes);
      return () => {
        el.classList.remove(...classes);
      };
    };
    classString = classString === true ? classString = "" : classString || "";
    return addClassesAndReturnUndo(missingClasses(classString));
  }
  function setClassesFromObject(el, classObject) {
    let split = (classString) => classString.split(" ").filter(Boolean);
    let forAdd = Object.entries(classObject).flatMap(([classString, bool]) => bool ? split(classString) : false).filter(Boolean);
    let forRemove = Object.entries(classObject).flatMap(([classString, bool]) => !bool ? split(classString) : false).filter(Boolean);
    let added = [];
    let removed = [];
    forRemove.forEach((i) => {
      if (el.classList.contains(i)) {
        el.classList.remove(i);
        removed.push(i);
      }
    });
    forAdd.forEach((i) => {
      if (!el.classList.contains(i)) {
        el.classList.add(i);
        added.push(i);
      }
    });
    return () => {
      removed.forEach((i) => el.classList.add(i));
      added.forEach((i) => el.classList.remove(i));
    };
  }
  function setStyles(el, value) {
    if (typeof value === "object" && value !== null) {
      return setStylesFromObject(el, value);
    }
    return setStylesFromString(el, value);
  }
  function setStylesFromObject(el, value) {
    let previousStyles = {};
    Object.entries(value).forEach(([key, value2]) => {
      previousStyles[key] = el.style[key];
      if (!key.startsWith("--")) {
        key = kebabCase(key);
      }
      el.style.setProperty(key, value2);
    });
    setTimeout(() => {
      if (el.style.length === 0) {
        el.removeAttribute("style");
      }
    });
    return () => {
      setStyles(el, previousStyles);
    };
  }
  function setStylesFromString(el, value) {
    let cache = el.getAttribute("style", value);
    el.setAttribute("style", value);
    return () => {
      el.setAttribute("style", cache || "");
    };
  }
  function kebabCase(subject) {
    return subject.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }
  function once(callback, fallback = () => {
  }) {
    let called = false;
    return function() {
      if (!called) {
        called = true;
        callback.apply(this, arguments);
      } else {
        fallback.apply(this, arguments);
      }
    };
  }
  directive("transition", (el, { value, modifiers, expression }, { evaluate: evaluate2 }) => {
    if (typeof expression === "function")
      expression = evaluate2(expression);
    if (expression === false)
      return;
    if (!expression || typeof expression === "boolean") {
      registerTransitionsFromHelper(el, modifiers, value);
    } else {
      registerTransitionsFromClassString(el, expression, value);
    }
  });
  function registerTransitionsFromClassString(el, classString, stage) {
    registerTransitionObject(el, setClasses, "");
    let directiveStorageMap = {
      enter: (classes) => {
        el._x_transition.enter.during = classes;
      },
      "enter-start": (classes) => {
        el._x_transition.enter.start = classes;
      },
      "enter-end": (classes) => {
        el._x_transition.enter.end = classes;
      },
      leave: (classes) => {
        el._x_transition.leave.during = classes;
      },
      "leave-start": (classes) => {
        el._x_transition.leave.start = classes;
      },
      "leave-end": (classes) => {
        el._x_transition.leave.end = classes;
      }
    };
    directiveStorageMap[stage](classString);
  }
  function registerTransitionsFromHelper(el, modifiers, stage) {
    registerTransitionObject(el, setStyles);
    let doesntSpecify = !modifiers.includes("in") && !modifiers.includes("out") && !stage;
    let transitioningIn = doesntSpecify || modifiers.includes("in") || ["enter"].includes(stage);
    let transitioningOut = doesntSpecify || modifiers.includes("out") || ["leave"].includes(stage);
    if (modifiers.includes("in") && !doesntSpecify) {
      modifiers = modifiers.filter((i, index2) => index2 < modifiers.indexOf("out"));
    }
    if (modifiers.includes("out") && !doesntSpecify) {
      modifiers = modifiers.filter((i, index2) => index2 > modifiers.indexOf("out"));
    }
    let wantsAll = !modifiers.includes("opacity") && !modifiers.includes("scale");
    let wantsOpacity = wantsAll || modifiers.includes("opacity");
    let wantsScale = wantsAll || modifiers.includes("scale");
    let opacityValue = wantsOpacity ? 0 : 1;
    let scaleValue = wantsScale ? modifierValue(modifiers, "scale", 95) / 100 : 1;
    let delay = modifierValue(modifiers, "delay", 0) / 1e3;
    let origin = modifierValue(modifiers, "origin", "center");
    let property = "opacity, transform";
    let durationIn = modifierValue(modifiers, "duration", 150) / 1e3;
    let durationOut = modifierValue(modifiers, "duration", 75) / 1e3;
    let easing = `cubic-bezier(0.4, 0.0, 0.2, 1)`;
    if (transitioningIn) {
      el._x_transition.enter.during = {
        transformOrigin: origin,
        transitionDelay: `${delay}s`,
        transitionProperty: property,
        transitionDuration: `${durationIn}s`,
        transitionTimingFunction: easing
      };
      el._x_transition.enter.start = {
        opacity: opacityValue,
        transform: `scale(${scaleValue})`
      };
      el._x_transition.enter.end = {
        opacity: 1,
        transform: `scale(1)`
      };
    }
    if (transitioningOut) {
      el._x_transition.leave.during = {
        transformOrigin: origin,
        transitionDelay: `${delay}s`,
        transitionProperty: property,
        transitionDuration: `${durationOut}s`,
        transitionTimingFunction: easing
      };
      el._x_transition.leave.start = {
        opacity: 1,
        transform: `scale(1)`
      };
      el._x_transition.leave.end = {
        opacity: opacityValue,
        transform: `scale(${scaleValue})`
      };
    }
  }
  function registerTransitionObject(el, setFunction, defaultValue = {}) {
    if (!el._x_transition)
      el._x_transition = {
        enter: { during: defaultValue, start: defaultValue, end: defaultValue },
        leave: { during: defaultValue, start: defaultValue, end: defaultValue },
        in(before = () => {
        }, after = () => {
        }) {
          transition(el, setFunction, {
            during: this.enter.during,
            start: this.enter.start,
            end: this.enter.end
          }, before, after);
        },
        out(before = () => {
        }, after = () => {
        }) {
          transition(el, setFunction, {
            during: this.leave.during,
            start: this.leave.start,
            end: this.leave.end
          }, before, after);
        }
      };
  }
  window.Element.prototype._x_toggleAndCascadeWithTransitions = function(el, value, show, hide) {
    const nextTick2 = document.visibilityState === "visible" ? requestAnimationFrame : setTimeout;
    let clickAwayCompatibleShow = () => nextTick2(show);
    if (value) {
      if (el._x_transition && (el._x_transition.enter || el._x_transition.leave)) {
        el._x_transition.enter && (Object.entries(el._x_transition.enter.during).length || Object.entries(el._x_transition.enter.start).length || Object.entries(el._x_transition.enter.end).length) ? el._x_transition.in(show) : clickAwayCompatibleShow();
      } else {
        el._x_transition ? el._x_transition.in(show) : clickAwayCompatibleShow();
      }
      return;
    }
    el._x_hidePromise = el._x_transition ? new Promise((resolve, reject) => {
      el._x_transition.out(() => {
      }, () => resolve(hide));
      el._x_transitioning.beforeCancel(() => reject({ isFromCancelledTransition: true }));
    }) : Promise.resolve(hide);
    queueMicrotask(() => {
      let closest = closestHide(el);
      if (closest) {
        if (!closest._x_hideChildren)
          closest._x_hideChildren = [];
        closest._x_hideChildren.push(el);
      } else {
        nextTick2(() => {
          let hideAfterChildren = (el2) => {
            let carry = Promise.all([
              el2._x_hidePromise,
              ...(el2._x_hideChildren || []).map(hideAfterChildren)
            ]).then(([i]) => i());
            delete el2._x_hidePromise;
            delete el2._x_hideChildren;
            return carry;
          };
          hideAfterChildren(el).catch((e) => {
            if (!e.isFromCancelledTransition)
              throw e;
          });
        });
      }
    });
  };
  function closestHide(el) {
    let parent = el.parentNode;
    if (!parent)
      return;
    return parent._x_hidePromise ? parent : closestHide(parent);
  }
  function transition(el, setFunction, { during, start: start2, end } = {}, before = () => {
  }, after = () => {
  }) {
    if (el._x_transitioning)
      el._x_transitioning.cancel();
    if (Object.keys(during).length === 0 && Object.keys(start2).length === 0 && Object.keys(end).length === 0) {
      before();
      after();
      return;
    }
    let undoStart, undoDuring, undoEnd;
    performTransition(el, {
      start() {
        undoStart = setFunction(el, start2);
      },
      during() {
        undoDuring = setFunction(el, during);
      },
      before,
      end() {
        undoStart();
        undoEnd = setFunction(el, end);
      },
      after,
      cleanup() {
        undoDuring();
        undoEnd();
      }
    });
  }
  function performTransition(el, stages) {
    let interrupted, reachedBefore, reachedEnd;
    let finish = once(() => {
      mutateDom(() => {
        interrupted = true;
        if (!reachedBefore)
          stages.before();
        if (!reachedEnd) {
          stages.end();
          releaseNextTicks();
        }
        stages.after();
        if (el.isConnected)
          stages.cleanup();
        delete el._x_transitioning;
      });
    });
    el._x_transitioning = {
      beforeCancels: [],
      beforeCancel(callback) {
        this.beforeCancels.push(callback);
      },
      cancel: once(function() {
        while (this.beforeCancels.length) {
          this.beforeCancels.shift()();
        }
        finish();
      }),
      finish
    };
    mutateDom(() => {
      stages.start();
      stages.during();
    });
    holdNextTicks();
    requestAnimationFrame(() => {
      if (interrupted)
        return;
      let duration = Number(getComputedStyle(el).transitionDuration.replace(/,.*/, "").replace("s", "")) * 1e3;
      let delay = Number(getComputedStyle(el).transitionDelay.replace(/,.*/, "").replace("s", "")) * 1e3;
      if (duration === 0)
        duration = Number(getComputedStyle(el).animationDuration.replace("s", "")) * 1e3;
      mutateDom(() => {
        stages.before();
      });
      reachedBefore = true;
      requestAnimationFrame(() => {
        if (interrupted)
          return;
        mutateDom(() => {
          stages.end();
        });
        releaseNextTicks();
        setTimeout(el._x_transitioning.finish, duration + delay);
        reachedEnd = true;
      });
    });
  }
  function modifierValue(modifiers, key, fallback) {
    if (modifiers.indexOf(key) === -1)
      return fallback;
    const rawValue = modifiers[modifiers.indexOf(key) + 1];
    if (!rawValue)
      return fallback;
    if (key === "scale") {
      if (isNaN(rawValue))
        return fallback;
    }
    if (key === "duration" || key === "delay") {
      let match = rawValue.match(/([0-9]+)ms/);
      if (match)
        return match[1];
    }
    if (key === "origin") {
      if (["top", "right", "left", "center", "bottom"].includes(modifiers[modifiers.indexOf(key) + 2])) {
        return [rawValue, modifiers[modifiers.indexOf(key) + 2]].join(" ");
      }
    }
    return rawValue;
  }
  var isCloning = false;
  function skipDuringClone(callback, fallback = () => {
  }) {
    return (...args) => isCloning ? fallback(...args) : callback(...args);
  }
  function onlyDuringClone(callback) {
    return (...args) => isCloning && callback(...args);
  }
  function clone(oldEl, newEl) {
    if (!newEl._x_dataStack)
      newEl._x_dataStack = oldEl._x_dataStack;
    isCloning = true;
    dontRegisterReactiveSideEffects(() => {
      cloneTree(newEl);
    });
    isCloning = false;
  }
  function cloneTree(el) {
    let hasRunThroughFirstEl = false;
    let shallowWalker = (el2, callback) => {
      walk(el2, (el3, skip) => {
        if (hasRunThroughFirstEl && isRoot(el3))
          return skip();
        hasRunThroughFirstEl = true;
        callback(el3, skip);
      });
    };
    initTree(el, shallowWalker);
  }
  function dontRegisterReactiveSideEffects(callback) {
    let cache = effect;
    overrideEffect((callback2, el) => {
      let storedEffect = cache(callback2);
      release(storedEffect);
      return () => {
      };
    });
    callback();
    overrideEffect(cache);
  }
  function bind(el, name, value, modifiers = []) {
    if (!el._x_bindings)
      el._x_bindings = reactive({});
    el._x_bindings[name] = value;
    name = modifiers.includes("camel") ? camelCase(name) : name;
    switch (name) {
      case "value":
        bindInputValue(el, value);
        break;
      case "style":
        bindStyles(el, value);
        break;
      case "class":
        bindClasses(el, value);
        break;
      case "selected":
      case "checked":
        bindAttributeAndProperty(el, name, value);
        break;
      default:
        bindAttribute(el, name, value);
        break;
    }
  }
  function bindInputValue(el, value) {
    if (el.type === "radio") {
      if (el.attributes.value === void 0) {
        el.value = value;
      }
      if (window.fromModel) {
        el.checked = checkedAttrLooseCompare(el.value, value);
      }
    } else if (el.type === "checkbox") {
      if (Number.isInteger(value)) {
        el.value = value;
      } else if (!Number.isInteger(value) && !Array.isArray(value) && typeof value !== "boolean" && ![null, void 0].includes(value)) {
        el.value = String(value);
      } else {
        if (Array.isArray(value)) {
          el.checked = value.some((val) => checkedAttrLooseCompare(val, el.value));
        } else {
          el.checked = !!value;
        }
      }
    } else if (el.tagName === "SELECT") {
      updateSelect(el, value);
    } else {
      if (el.value === value)
        return;
      el.value = value;
    }
  }
  function bindClasses(el, value) {
    if (el._x_undoAddedClasses)
      el._x_undoAddedClasses();
    el._x_undoAddedClasses = setClasses(el, value);
  }
  function bindStyles(el, value) {
    if (el._x_undoAddedStyles)
      el._x_undoAddedStyles();
    el._x_undoAddedStyles = setStyles(el, value);
  }
  function bindAttributeAndProperty(el, name, value) {
    bindAttribute(el, name, value);
    setPropertyIfChanged(el, name, value);
  }
  function bindAttribute(el, name, value) {
    if ([null, void 0, false].includes(value) && attributeShouldntBePreservedIfFalsy(name)) {
      el.removeAttribute(name);
    } else {
      if (isBooleanAttr(name))
        value = name;
      setIfChanged(el, name, value);
    }
  }
  function setIfChanged(el, attrName, value) {
    if (el.getAttribute(attrName) != value) {
      el.setAttribute(attrName, value);
    }
  }
  function setPropertyIfChanged(el, propName, value) {
    if (el[propName] !== value) {
      el[propName] = value;
    }
  }
  function updateSelect(el, value) {
    const arrayWrappedValue = [].concat(value).map((value2) => {
      return value2 + "";
    });
    Array.from(el.options).forEach((option) => {
      option.selected = arrayWrappedValue.includes(option.value);
    });
  }
  function camelCase(subject) {
    return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
  }
  function checkedAttrLooseCompare(valueA, valueB) {
    return valueA == valueB;
  }
  function isBooleanAttr(attrName) {
    const booleanAttributes = [
      "disabled",
      "checked",
      "required",
      "readonly",
      "hidden",
      "open",
      "selected",
      "autofocus",
      "itemscope",
      "multiple",
      "novalidate",
      "allowfullscreen",
      "allowpaymentrequest",
      "formnovalidate",
      "autoplay",
      "controls",
      "loop",
      "muted",
      "playsinline",
      "default",
      "ismap",
      "reversed",
      "async",
      "defer",
      "nomodule"
    ];
    return booleanAttributes.includes(attrName);
  }
  function attributeShouldntBePreservedIfFalsy(name) {
    return !["aria-pressed", "aria-checked", "aria-expanded", "aria-selected"].includes(name);
  }
  function getBinding(el, name, fallback) {
    if (el._x_bindings && el._x_bindings[name] !== void 0)
      return el._x_bindings[name];
    return getAttributeBinding(el, name, fallback);
  }
  function extractProp(el, name, fallback, extract = true) {
    if (el._x_bindings && el._x_bindings[name] !== void 0)
      return el._x_bindings[name];
    if (el._x_inlineBindings && el._x_inlineBindings[name] !== void 0) {
      let binding = el._x_inlineBindings[name];
      binding.extract = extract;
      return dontAutoEvaluateFunctions(() => {
        return evaluate(el, binding.expression);
      });
    }
    return getAttributeBinding(el, name, fallback);
  }
  function getAttributeBinding(el, name, fallback) {
    let attr = el.getAttribute(name);
    if (attr === null)
      return typeof fallback === "function" ? fallback() : fallback;
    if (attr === "")
      return true;
    if (isBooleanAttr(name)) {
      return !![name, "true"].includes(attr);
    }
    return attr;
  }
  function debounce(func, wait) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  function throttle(func, limit) {
    let inThrottle;
    return function() {
      let context = this, args = arguments;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  function plugin(callback) {
    let callbacks = Array.isArray(callback) ? callback : [callback];
    callbacks.forEach((i) => i(alpine_default));
  }
  var stores = {};
  var isReactive = false;
  function store(name, value) {
    if (!isReactive) {
      stores = reactive(stores);
      isReactive = true;
    }
    if (value === void 0) {
      return stores[name];
    }
    stores[name] = value;
    if (typeof value === "object" && value !== null && value.hasOwnProperty("init") && typeof value.init === "function") {
      stores[name].init();
    }
    initInterceptors(stores[name]);
  }
  function getStores() {
    return stores;
  }
  var binds = {};
  function bind2(name, bindings) {
    let getBindings = typeof bindings !== "function" ? () => bindings : bindings;
    if (name instanceof Element) {
      applyBindingsObject(name, getBindings());
    } else {
      binds[name] = getBindings;
    }
  }
  function injectBindingProviders(obj) {
    Object.entries(binds).forEach(([name, callback]) => {
      Object.defineProperty(obj, name, {
        get() {
          return (...args) => {
            return callback(...args);
          };
        }
      });
    });
    return obj;
  }
  function applyBindingsObject(el, obj, original) {
    let cleanupRunners = [];
    while (cleanupRunners.length)
      cleanupRunners.pop()();
    let attributes = Object.entries(obj).map(([name, value]) => ({ name, value }));
    let staticAttributes = attributesOnly(attributes);
    attributes = attributes.map((attribute) => {
      if (staticAttributes.find((attr) => attr.name === attribute.name)) {
        return {
          name: `x-bind:${attribute.name}`,
          value: `"${attribute.value}"`
        };
      }
      return attribute;
    });
    directives(el, attributes, original).map((handle) => {
      cleanupRunners.push(handle.runCleanups);
      handle();
    });
  }
  var datas = {};
  function data(name, callback) {
    datas[name] = callback;
  }
  function injectDataProviders(obj, context) {
    Object.entries(datas).forEach(([name, callback]) => {
      Object.defineProperty(obj, name, {
        get() {
          return (...args) => {
            return callback.bind(context)(...args);
          };
        },
        enumerable: false
      });
    });
    return obj;
  }
  var Alpine = {
    get reactive() {
      return reactive;
    },
    get release() {
      return release;
    },
    get effect() {
      return effect;
    },
    get raw() {
      return raw;
    },
    version: "3.12.3",
    flushAndStopDeferringMutations,
    dontAutoEvaluateFunctions,
    disableEffectScheduling,
    startObservingMutations,
    stopObservingMutations,
    setReactivityEngine,
    closestDataStack,
    skipDuringClone,
    onlyDuringClone,
    addRootSelector,
    addInitSelector,
    addScopeToNode,
    deferMutations,
    mapAttributes,
    evaluateLater,
    interceptInit,
    setEvaluator,
    mergeProxies,
    extractProp,
    findClosest,
    closestRoot,
    destroyTree,
    interceptor,
    transition,
    setStyles,
    mutateDom,
    directive,
    throttle,
    debounce,
    evaluate,
    initTree,
    nextTick,
    prefixed: prefix,
    prefix: setPrefix,
    plugin,
    magic,
    store,
    start,
    clone,
    bound: getBinding,
    $data: scope,
    walk,
    data,
    bind: bind2
  };
  var alpine_default = Alpine;
  function makeMap(str, expectsLowerCase) {
    const map = /* @__PURE__ */ Object.create(null);
    const list = str.split(",");
    for (let i = 0; i < list.length; i++) {
      map[list[i]] = true;
    }
    return expectsLowerCase ? (val) => !!map[val.toLowerCase()] : (val) => !!map[val];
  }
  var EMPTY_OBJ = Object.freeze({});
  Object.freeze([]);
  var extend = Object.assign;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var hasOwn = (val, key) => hasOwnProperty.call(val, key);
  var isArray = Array.isArray;
  var isMap = (val) => toTypeString(val) === "[object Map]";
  var isString = (val) => typeof val === "string";
  var isSymbol = (val) => typeof val === "symbol";
  var isObject = (val) => val !== null && typeof val === "object";
  var objectToString = Object.prototype.toString;
  var toTypeString = (value) => objectToString.call(value);
  var toRawType = (value) => {
    return toTypeString(value).slice(8, -1);
  };
  var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
  var cacheStringFunction = (fn) => {
    const cache = /* @__PURE__ */ Object.create(null);
    return (str) => {
      const hit = cache[str];
      return hit || (cache[str] = fn(str));
    };
  };
  var capitalize = cacheStringFunction((str) => str.charAt(0).toUpperCase() + str.slice(1));
  var hasChanged = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);
  var targetMap = /* @__PURE__ */ new WeakMap();
  var effectStack = [];
  var activeEffect;
  var ITERATE_KEY = Symbol("iterate");
  var MAP_KEY_ITERATE_KEY = Symbol("Map key iterate");
  function isEffect(fn) {
    return fn && fn._isEffect === true;
  }
  function effect2(fn, options = EMPTY_OBJ) {
    if (isEffect(fn)) {
      fn = fn.raw;
    }
    const effect3 = createReactiveEffect(fn, options);
    if (!options.lazy) {
      effect3();
    }
    return effect3;
  }
  function stop(effect3) {
    if (effect3.active) {
      cleanup(effect3);
      if (effect3.options.onStop) {
        effect3.options.onStop();
      }
      effect3.active = false;
    }
  }
  var uid = 0;
  function createReactiveEffect(fn, options) {
    const effect3 = function reactiveEffect() {
      if (!effect3.active) {
        return fn();
      }
      if (!effectStack.includes(effect3)) {
        cleanup(effect3);
        try {
          enableTracking();
          effectStack.push(effect3);
          activeEffect = effect3;
          return fn();
        } finally {
          effectStack.pop();
          resetTracking();
          activeEffect = effectStack[effectStack.length - 1];
        }
      }
    };
    effect3.id = uid++;
    effect3.allowRecurse = !!options.allowRecurse;
    effect3._isEffect = true;
    effect3.active = true;
    effect3.raw = fn;
    effect3.deps = [];
    effect3.options = options;
    return effect3;
  }
  function cleanup(effect3) {
    const { deps } = effect3;
    if (deps.length) {
      for (let i = 0; i < deps.length; i++) {
        deps[i].delete(effect3);
      }
      deps.length = 0;
    }
  }
  var shouldTrack = true;
  var trackStack = [];
  function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
  }
  function enableTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = true;
  }
  function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === void 0 ? true : last;
  }
  function track(target, type, key) {
    if (!shouldTrack || activeEffect === void 0) {
      return;
    }
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = /* @__PURE__ */ new Set());
    }
    if (!dep.has(activeEffect)) {
      dep.add(activeEffect);
      activeEffect.deps.push(dep);
      if (activeEffect.options.onTrack) {
        activeEffect.options.onTrack({
          effect: activeEffect,
          target,
          type,
          key
        });
      }
    }
  }
  function trigger(target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
      return;
    }
    const effects = /* @__PURE__ */ new Set();
    const add2 = (effectsToAdd) => {
      if (effectsToAdd) {
        effectsToAdd.forEach((effect3) => {
          if (effect3 !== activeEffect || effect3.allowRecurse) {
            effects.add(effect3);
          }
        });
      }
    };
    if (type === "clear") {
      depsMap.forEach(add2);
    } else if (key === "length" && isArray(target)) {
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 >= newValue) {
          add2(dep);
        }
      });
    } else {
      if (key !== void 0) {
        add2(depsMap.get(key));
      }
      switch (type) {
        case "add":
          if (!isArray(target)) {
            add2(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              add2(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isIntegerKey(key)) {
            add2(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!isArray(target)) {
            add2(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              add2(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            add2(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
    const run = (effect3) => {
      if (effect3.options.onTrigger) {
        effect3.options.onTrigger({
          effect: effect3,
          target,
          key,
          type,
          newValue,
          oldValue,
          oldTarget
        });
      }
      if (effect3.options.scheduler) {
        effect3.options.scheduler(effect3);
      } else {
        effect3();
      }
    };
    effects.forEach(run);
  }
  var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
  var builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol).map((key) => Symbol[key]).filter(isSymbol));
  var get2 = /* @__PURE__ */ createGetter();
  var shallowGet = /* @__PURE__ */ createGetter(false, true);
  var readonlyGet = /* @__PURE__ */ createGetter(true);
  var shallowReadonlyGet = /* @__PURE__ */ createGetter(true, true);
  var arrayInstrumentations = {};
  ["includes", "indexOf", "lastIndexOf"].forEach((key) => {
    const method = Array.prototype[key];
    arrayInstrumentations[key] = function(...args) {
      const arr = toRaw(this);
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, "get", i + "");
      }
      const res = method.apply(arr, args);
      if (res === -1 || res === false) {
        return method.apply(arr, args.map(toRaw));
      } else {
        return res;
      }
    };
  });
  ["push", "pop", "shift", "unshift", "splice"].forEach((key) => {
    const method = Array.prototype[key];
    arrayInstrumentations[key] = function(...args) {
      pauseTracking();
      const res = method.apply(this, args);
      resetTracking();
      return res;
    };
  });
  function createGetter(isReadonly = false, shallow = false) {
    return function get3(target, key, receiver) {
      if (key === "__v_isReactive") {
        return !isReadonly;
      } else if (key === "__v_isReadonly") {
        return isReadonly;
      } else if (key === "__v_raw" && receiver === (isReadonly ? shallow ? shallowReadonlyMap : readonlyMap : shallow ? shallowReactiveMap : reactiveMap).get(target)) {
        return target;
      }
      const targetIsArray = isArray(target);
      if (!isReadonly && targetIsArray && hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }
      const res = Reflect.get(target, key, receiver);
      if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
        return res;
      }
      if (!isReadonly) {
        track(target, "get", key);
      }
      if (shallow) {
        return res;
      }
      if (isRef(res)) {
        const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
        return shouldUnwrap ? res.value : res;
      }
      if (isObject(res)) {
        return isReadonly ? readonly(res) : reactive2(res);
      }
      return res;
    };
  }
  var set2 = /* @__PURE__ */ createSetter();
  var shallowSet = /* @__PURE__ */ createSetter(true);
  function createSetter(shallow = false) {
    return function set3(target, key, value, receiver) {
      let oldValue = target[key];
      if (!shallow) {
        value = toRaw(value);
        oldValue = toRaw(oldValue);
        if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
          oldValue.value = value;
          return true;
        }
      }
      const hadKey = isArray(target) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key);
      const result = Reflect.set(target, key, value, receiver);
      if (target === toRaw(receiver)) {
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value, oldValue);
        }
      }
      return result;
    };
  }
  function deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0, oldValue);
    }
    return result;
  }
  function has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  function ownKeys(target) {
    track(target, "iterate", isArray(target) ? "length" : ITERATE_KEY);
    return Reflect.ownKeys(target);
  }
  var mutableHandlers = {
    get: get2,
    set: set2,
    deleteProperty,
    has,
    ownKeys
  };
  var readonlyHandlers = {
    get: readonlyGet,
    set(target, key) {
      {
        console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
      }
      return true;
    },
    deleteProperty(target, key) {
      {
        console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
      }
      return true;
    }
  };
  extend({}, mutableHandlers, {
    get: shallowGet,
    set: shallowSet
  });
  extend({}, readonlyHandlers, {
    get: shallowReadonlyGet
  });
  var toReactive = (value) => isObject(value) ? reactive2(value) : value;
  var toReadonly = (value) => isObject(value) ? readonly(value) : value;
  var toShallow = (value) => value;
  var getProto = (v) => Reflect.getPrototypeOf(v);
  function get$1(target, key, isReadonly = false, isShallow = false) {
    target = target["__v_raw"];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);
    if (key !== rawKey) {
      !isReadonly && track(rawTarget, "get", key);
    }
    !isReadonly && track(rawTarget, "get", rawKey);
    const { has: has2 } = getProto(rawTarget);
    const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
    if (has2.call(rawTarget, key)) {
      return wrap(target.get(key));
    } else if (has2.call(rawTarget, rawKey)) {
      return wrap(target.get(rawKey));
    } else if (target !== rawTarget) {
      target.get(key);
    }
  }
  function has$1(key, isReadonly = false) {
    const target = this["__v_raw"];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);
    if (key !== rawKey) {
      !isReadonly && track(rawTarget, "has", key);
    }
    !isReadonly && track(rawTarget, "has", rawKey);
    return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
  }
  function size(target, isReadonly = false) {
    target = target["__v_raw"];
    !isReadonly && track(toRaw(target), "iterate", ITERATE_KEY);
    return Reflect.get(target, "size", target);
  }
  function add(value) {
    value = toRaw(value);
    const target = toRaw(this);
    const proto = getProto(target);
    const hadKey = proto.has.call(target, value);
    if (!hadKey) {
      target.add(value);
      trigger(target, "add", value, value);
    }
    return this;
  }
  function set$1(key, value) {
    value = toRaw(value);
    const target = toRaw(this);
    const { has: has2, get: get3 } = getProto(target);
    let hadKey = has2.call(target, key);
    if (!hadKey) {
      key = toRaw(key);
      hadKey = has2.call(target, key);
    } else {
      checkIdentityKeys(target, has2, key);
    }
    const oldValue = get3.call(target, key);
    target.set(key, value);
    if (!hadKey) {
      trigger(target, "add", key, value);
    } else if (hasChanged(value, oldValue)) {
      trigger(target, "set", key, value, oldValue);
    }
    return this;
  }
  function deleteEntry(key) {
    const target = toRaw(this);
    const { has: has2, get: get3 } = getProto(target);
    let hadKey = has2.call(target, key);
    if (!hadKey) {
      key = toRaw(key);
      hadKey = has2.call(target, key);
    } else {
      checkIdentityKeys(target, has2, key);
    }
    const oldValue = get3 ? get3.call(target, key) : void 0;
    const result = target.delete(key);
    if (hadKey) {
      trigger(target, "delete", key, void 0, oldValue);
    }
    return result;
  }
  function clear() {
    const target = toRaw(this);
    const hadItems = target.size !== 0;
    const oldTarget = isMap(target) ? new Map(target) : new Set(target);
    const result = target.clear();
    if (hadItems) {
      trigger(target, "clear", void 0, void 0, oldTarget);
    }
    return result;
  }
  function createForEach(isReadonly, isShallow) {
    return function forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = toRaw(target);
      const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
      !isReadonly && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    };
  }
  function createIterableMethod(method, isReadonly, isShallow) {
    return function(...args) {
      const target = this["__v_raw"];
      const rawTarget = toRaw(target);
      const targetIsMap = isMap(rawTarget);
      const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
      const isKeyOnly = method === "keys" && targetIsMap;
      const innerIterator = target[method](...args);
      const wrap = isShallow ? toShallow : isReadonly ? toReadonly : toReactive;
      !isReadonly && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
      return {
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        },
        [Symbol.iterator]() {
          return this;
        }
      };
    };
  }
  function createReadonlyMethod(type) {
    return function(...args) {
      {
        const key = args[0] ? `on key "${args[0]}" ` : ``;
        console.warn(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
      }
      return type === "delete" ? false : this;
    };
  }
  var mutableInstrumentations = {
    get(key) {
      return get$1(this, key);
    },
    get size() {
      return size(this);
    },
    has: has$1,
    add,
    set: set$1,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, false)
  };
  var shallowInstrumentations = {
    get(key) {
      return get$1(this, key, false, true);
    },
    get size() {
      return size(this);
    },
    has: has$1,
    add,
    set: set$1,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, true)
  };
  var readonlyInstrumentations = {
    get(key) {
      return get$1(this, key, true);
    },
    get size() {
      return size(this, true);
    },
    has(key) {
      return has$1.call(this, key, true);
    },
    add: createReadonlyMethod("add"),
    set: createReadonlyMethod("set"),
    delete: createReadonlyMethod("delete"),
    clear: createReadonlyMethod("clear"),
    forEach: createForEach(true, false)
  };
  var shallowReadonlyInstrumentations = {
    get(key) {
      return get$1(this, key, true, true);
    },
    get size() {
      return size(this, true);
    },
    has(key) {
      return has$1.call(this, key, true);
    },
    add: createReadonlyMethod("add"),
    set: createReadonlyMethod("set"),
    delete: createReadonlyMethod("delete"),
    clear: createReadonlyMethod("clear"),
    forEach: createForEach(true, true)
  };
  var iteratorMethods = ["keys", "values", "entries", Symbol.iterator];
  iteratorMethods.forEach((method) => {
    mutableInstrumentations[method] = createIterableMethod(method, false, false);
    readonlyInstrumentations[method] = createIterableMethod(method, true, false);
    shallowInstrumentations[method] = createIterableMethod(method, false, true);
    shallowReadonlyInstrumentations[method] = createIterableMethod(method, true, true);
  });
  function createInstrumentationGetter(isReadonly, shallow) {
    const instrumentations = shallow ? isReadonly ? shallowReadonlyInstrumentations : shallowInstrumentations : isReadonly ? readonlyInstrumentations : mutableInstrumentations;
    return (target, key, receiver) => {
      if (key === "__v_isReactive") {
        return !isReadonly;
      } else if (key === "__v_isReadonly") {
        return isReadonly;
      } else if (key === "__v_raw") {
        return target;
      }
      return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
    };
  }
  var mutableCollectionHandlers = {
    get: createInstrumentationGetter(false, false)
  };
  var readonlyCollectionHandlers = {
    get: createInstrumentationGetter(true, false)
  };
  function checkIdentityKeys(target, has2, key) {
    const rawKey = toRaw(key);
    if (rawKey !== key && has2.call(target, rawKey)) {
      const type = toRawType(target);
      console.warn(`Reactive ${type} contains both the raw and reactive versions of the same object${type === `Map` ? ` as keys` : ``}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`);
    }
  }
  var reactiveMap = /* @__PURE__ */ new WeakMap();
  var shallowReactiveMap = /* @__PURE__ */ new WeakMap();
  var readonlyMap = /* @__PURE__ */ new WeakMap();
  var shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
  function targetTypeMap(rawType) {
    switch (rawType) {
      case "Object":
      case "Array":
        return 1;
      case "Map":
      case "Set":
      case "WeakMap":
      case "WeakSet":
        return 2;
      default:
        return 0;
    }
  }
  function getTargetType(value) {
    return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
  }
  function reactive2(target) {
    if (target && target["__v_isReadonly"]) {
      return target;
    }
    return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
  }
  function readonly(target) {
    return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
  }
  function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers, proxyMap) {
    if (!isObject(target)) {
      {
        console.warn(`value cannot be made reactive: ${String(target)}`);
      }
      return target;
    }
    if (target["__v_raw"] && !(isReadonly && target["__v_isReactive"])) {
      return target;
    }
    const existingProxy = proxyMap.get(target);
    if (existingProxy) {
      return existingProxy;
    }
    const targetType = getTargetType(target);
    if (targetType === 0) {
      return target;
    }
    const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
    proxyMap.set(target, proxy);
    return proxy;
  }
  function toRaw(observed) {
    return observed && toRaw(observed["__v_raw"]) || observed;
  }
  function isRef(r) {
    return Boolean(r && r.__v_isRef === true);
  }
  magic("nextTick", () => nextTick);
  magic("dispatch", (el) => dispatch.bind(dispatch, el));
  magic("watch", (el, { evaluateLater: evaluateLater2, effect: effect3 }) => (key, callback) => {
    let evaluate2 = evaluateLater2(key);
    let firstTime = true;
    let oldValue;
    let effectReference = effect3(() => evaluate2((value) => {
      JSON.stringify(value);
      if (!firstTime) {
        queueMicrotask(() => {
          callback(value, oldValue);
          oldValue = value;
        });
      } else {
        oldValue = value;
      }
      firstTime = false;
    }));
    el._x_effects.delete(effectReference);
  });
  magic("store", getStores);
  magic("data", (el) => scope(el));
  magic("root", (el) => closestRoot(el));
  magic("refs", (el) => {
    if (el._x_refs_proxy)
      return el._x_refs_proxy;
    el._x_refs_proxy = mergeProxies(getArrayOfRefObject(el));
    return el._x_refs_proxy;
  });
  function getArrayOfRefObject(el) {
    let refObjects = [];
    let currentEl = el;
    while (currentEl) {
      if (currentEl._x_refs)
        refObjects.push(currentEl._x_refs);
      currentEl = currentEl.parentNode;
    }
    return refObjects;
  }
  var globalIdMemo = {};
  function findAndIncrementId(name) {
    if (!globalIdMemo[name])
      globalIdMemo[name] = 0;
    return ++globalIdMemo[name];
  }
  function closestIdRoot(el, name) {
    return findClosest(el, (element) => {
      if (element._x_ids && element._x_ids[name])
        return true;
    });
  }
  function setIdRoot(el, name) {
    if (!el._x_ids)
      el._x_ids = {};
    if (!el._x_ids[name])
      el._x_ids[name] = findAndIncrementId(name);
  }
  magic("id", (el) => (name, key = null) => {
    let root = closestIdRoot(el, name);
    let id = root ? root._x_ids[name] : findAndIncrementId(name);
    return key ? `${name}-${id}-${key}` : `${name}-${id}`;
  });
  magic("el", (el) => el);
  warnMissingPluginMagic("Focus", "focus", "focus");
  warnMissingPluginMagic("Persist", "persist", "persist");
  function warnMissingPluginMagic(name, magicName, slug) {
    magic(magicName, (el) => warn(`You can't use [$${directiveName}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
  }
  function entangle({ get: outerGet, set: outerSet }, { get: innerGet, set: innerSet }) {
    let firstRun = true;
    let outerHash, outerHashLatest;
    let reference = effect(() => {
      let outer, inner;
      if (firstRun) {
        outer = outerGet();
        innerSet(outer);
        inner = innerGet();
        firstRun = false;
      } else {
        outer = outerGet();
        inner = innerGet();
        outerHashLatest = JSON.stringify(outer);
        JSON.stringify(inner);
        if (outerHashLatest !== outerHash) {
          inner = innerGet();
          innerSet(outer);
          inner = outer;
        } else {
          outerSet(inner);
          outer = inner;
        }
      }
      outerHash = JSON.stringify(outer);
      JSON.stringify(inner);
    });
    return () => {
      release(reference);
    };
  }
  directive("modelable", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2, cleanup: cleanup2 }) => {
    let func = evaluateLater2(expression);
    let innerGet = () => {
      let result;
      func((i) => result = i);
      return result;
    };
    let evaluateInnerSet = evaluateLater2(`${expression} = __placeholder`);
    let innerSet = (val) => evaluateInnerSet(() => {
    }, { scope: { __placeholder: val } });
    let initialValue = innerGet();
    innerSet(initialValue);
    queueMicrotask(() => {
      if (!el._x_model)
        return;
      el._x_removeModelListeners["default"]();
      let outerGet = el._x_model.get;
      let outerSet = el._x_model.set;
      let releaseEntanglement = entangle({
        get() {
          return outerGet();
        },
        set(value) {
          outerSet(value);
        }
      }, {
        get() {
          return innerGet();
        },
        set(value) {
          innerSet(value);
        }
      });
      cleanup2(releaseEntanglement);
    });
  });
  var teleportContainerDuringClone = document.createElement("div");
  directive("teleport", (el, { modifiers, expression }, { cleanup: cleanup2 }) => {
    if (el.tagName.toLowerCase() !== "template")
      warn("x-teleport can only be used on a <template> tag", el);
    let target = skipDuringClone(() => {
      return document.querySelector(expression);
    }, () => {
      return teleportContainerDuringClone;
    })();
    if (!target)
      warn(`Cannot find x-teleport element for selector: "${expression}"`);
    let clone2 = el.content.cloneNode(true).firstElementChild;
    el._x_teleport = clone2;
    clone2._x_teleportBack = el;
    if (el._x_forwardEvents) {
      el._x_forwardEvents.forEach((eventName) => {
        clone2.addEventListener(eventName, (e) => {
          e.stopPropagation();
          el.dispatchEvent(new e.constructor(e.type, e));
        });
      });
    }
    addScopeToNode(clone2, {}, el);
    mutateDom(() => {
      if (modifiers.includes("prepend")) {
        target.parentNode.insertBefore(clone2, target);
      } else if (modifiers.includes("append")) {
        target.parentNode.insertBefore(clone2, target.nextSibling);
      } else {
        target.appendChild(clone2);
      }
      initTree(clone2);
      clone2._x_ignore = true;
    });
    cleanup2(() => clone2.remove());
  });
  var handler = () => {
  };
  handler.inline = (el, { modifiers }, { cleanup: cleanup2 }) => {
    modifiers.includes("self") ? el._x_ignoreSelf = true : el._x_ignore = true;
    cleanup2(() => {
      modifiers.includes("self") ? delete el._x_ignoreSelf : delete el._x_ignore;
    });
  };
  directive("ignore", handler);
  directive("effect", (el, { expression }, { effect: effect3 }) => effect3(evaluateLater(el, expression)));
  function on(el, event2, modifiers, callback) {
    let listenerTarget = el;
    let handler4 = (e) => callback(e);
    let options = {};
    let wrapHandler = (callback2, wrapper) => (e) => wrapper(callback2, e);
    if (modifiers.includes("dot"))
      event2 = dotSyntax(event2);
    if (modifiers.includes("camel"))
      event2 = camelCase2(event2);
    if (modifiers.includes("passive"))
      options.passive = true;
    if (modifiers.includes("capture"))
      options.capture = true;
    if (modifiers.includes("window"))
      listenerTarget = window;
    if (modifiers.includes("document"))
      listenerTarget = document;
    if (modifiers.includes("debounce")) {
      let nextModifier = modifiers[modifiers.indexOf("debounce") + 1] || "invalid-wait";
      let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
      handler4 = debounce(handler4, wait);
    }
    if (modifiers.includes("throttle")) {
      let nextModifier = modifiers[modifiers.indexOf("throttle") + 1] || "invalid-wait";
      let wait = isNumeric(nextModifier.split("ms")[0]) ? Number(nextModifier.split("ms")[0]) : 250;
      handler4 = throttle(handler4, wait);
    }
    if (modifiers.includes("prevent"))
      handler4 = wrapHandler(handler4, (next, e) => {
        e.preventDefault();
        next(e);
      });
    if (modifiers.includes("stop"))
      handler4 = wrapHandler(handler4, (next, e) => {
        e.stopPropagation();
        next(e);
      });
    if (modifiers.includes("self"))
      handler4 = wrapHandler(handler4, (next, e) => {
        e.target === el && next(e);
      });
    if (modifiers.includes("away") || modifiers.includes("outside")) {
      listenerTarget = document;
      handler4 = wrapHandler(handler4, (next, e) => {
        if (el.contains(e.target))
          return;
        if (e.target.isConnected === false)
          return;
        if (el.offsetWidth < 1 && el.offsetHeight < 1)
          return;
        if (el._x_isShown === false)
          return;
        next(e);
      });
    }
    if (modifiers.includes("once")) {
      handler4 = wrapHandler(handler4, (next, e) => {
        next(e);
        listenerTarget.removeEventListener(event2, handler4, options);
      });
    }
    handler4 = wrapHandler(handler4, (next, e) => {
      if (isKeyEvent(event2)) {
        if (isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers)) {
          return;
        }
      }
      next(e);
    });
    listenerTarget.addEventListener(event2, handler4, options);
    return () => {
      listenerTarget.removeEventListener(event2, handler4, options);
    };
  }
  function dotSyntax(subject) {
    return subject.replace(/-/g, ".");
  }
  function camelCase2(subject) {
    return subject.toLowerCase().replace(/-(\w)/g, (match, char) => char.toUpperCase());
  }
  function isNumeric(subject) {
    return !Array.isArray(subject) && !isNaN(subject);
  }
  function kebabCase2(subject) {
    if ([" ", "_"].includes(subject))
      return subject;
    return subject.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[_\s]/, "-").toLowerCase();
  }
  function isKeyEvent(event2) {
    return ["keydown", "keyup"].includes(event2);
  }
  function isListeningForASpecificKeyThatHasntBeenPressed(e, modifiers) {
    let keyModifiers = modifiers.filter((i) => {
      return !["window", "document", "prevent", "stop", "once", "capture"].includes(i);
    });
    if (keyModifiers.includes("debounce")) {
      let debounceIndex = keyModifiers.indexOf("debounce");
      keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
    }
    if (keyModifiers.includes("throttle")) {
      let debounceIndex = keyModifiers.indexOf("throttle");
      keyModifiers.splice(debounceIndex, isNumeric((keyModifiers[debounceIndex + 1] || "invalid-wait").split("ms")[0]) ? 2 : 1);
    }
    if (keyModifiers.length === 0)
      return false;
    if (keyModifiers.length === 1 && keyToModifiers(e.key).includes(keyModifiers[0]))
      return false;
    const systemKeyModifiers = ["ctrl", "shift", "alt", "meta", "cmd", "super"];
    const selectedSystemKeyModifiers = systemKeyModifiers.filter((modifier) => keyModifiers.includes(modifier));
    keyModifiers = keyModifiers.filter((i) => !selectedSystemKeyModifiers.includes(i));
    if (selectedSystemKeyModifiers.length > 0) {
      const activelyPressedKeyModifiers = selectedSystemKeyModifiers.filter((modifier) => {
        if (modifier === "cmd" || modifier === "super")
          modifier = "meta";
        return e[`${modifier}Key`];
      });
      if (activelyPressedKeyModifiers.length === selectedSystemKeyModifiers.length) {
        if (keyToModifiers(e.key).includes(keyModifiers[0]))
          return false;
      }
    }
    return true;
  }
  function keyToModifiers(key) {
    if (!key)
      return [];
    key = kebabCase2(key);
    let modifierToKeyMap = {
      ctrl: "control",
      slash: "/",
      space: " ",
      spacebar: " ",
      cmd: "meta",
      esc: "escape",
      up: "arrow-up",
      down: "arrow-down",
      left: "arrow-left",
      right: "arrow-right",
      period: ".",
      equal: "=",
      minus: "-",
      underscore: "_"
    };
    modifierToKeyMap[key] = key;
    return Object.keys(modifierToKeyMap).map((modifier) => {
      if (modifierToKeyMap[modifier] === key)
        return modifier;
    }).filter((modifier) => modifier);
  }
  directive("model", (el, { modifiers, expression }, { effect: effect3, cleanup: cleanup2 }) => {
    let scopeTarget = el;
    if (modifiers.includes("parent")) {
      scopeTarget = el.parentNode;
    }
    let evaluateGet = evaluateLater(scopeTarget, expression);
    let evaluateSet;
    if (typeof expression === "string") {
      evaluateSet = evaluateLater(scopeTarget, `${expression} = __placeholder`);
    } else if (typeof expression === "function" && typeof expression() === "string") {
      evaluateSet = evaluateLater(scopeTarget, `${expression()} = __placeholder`);
    } else {
      evaluateSet = () => {
      };
    }
    let getValue = () => {
      let result;
      evaluateGet((value) => result = value);
      return isGetterSetter(result) ? result.get() : result;
    };
    let setValue = (value) => {
      let result;
      evaluateGet((value2) => result = value2);
      if (isGetterSetter(result)) {
        result.set(value);
      } else {
        evaluateSet(() => {
        }, {
          scope: { __placeholder: value }
        });
      }
    };
    if (typeof expression === "string" && el.type === "radio") {
      mutateDom(() => {
        if (!el.hasAttribute("name"))
          el.setAttribute("name", expression);
      });
    }
    var event2 = el.tagName.toLowerCase() === "select" || ["checkbox", "radio"].includes(el.type) || modifiers.includes("lazy") ? "change" : "input";
    let removeListener = isCloning ? () => {
    } : on(el, event2, modifiers, (e) => {
      setValue(getInputValue(el, modifiers, e, getValue()));
    });
    if (modifiers.includes("fill") && [null, ""].includes(getValue())) {
      el.dispatchEvent(new Event(event2, {}));
    }
    if (!el._x_removeModelListeners)
      el._x_removeModelListeners = {};
    el._x_removeModelListeners["default"] = removeListener;
    cleanup2(() => el._x_removeModelListeners["default"]());
    if (el.form) {
      let removeResetListener = on(el.form, "reset", [], (e) => {
        nextTick(() => el._x_model && el._x_model.set(el.value));
      });
      cleanup2(() => removeResetListener());
    }
    el._x_model = {
      get() {
        return getValue();
      },
      set(value) {
        setValue(value);
      }
    };
    el._x_forceModelUpdate = (value) => {
      value = value === void 0 ? getValue() : value;
      if (value === void 0 && typeof expression === "string" && expression.match(/\./))
        value = "";
      window.fromModel = true;
      mutateDom(() => bind(el, "value", value));
      delete window.fromModel;
    };
    effect3(() => {
      let value = getValue();
      if (modifiers.includes("unintrusive") && document.activeElement.isSameNode(el))
        return;
      el._x_forceModelUpdate(value);
    });
  });
  function getInputValue(el, modifiers, event2, currentValue) {
    return mutateDom(() => {
      var _a;
      if (event2 instanceof CustomEvent && event2.detail !== void 0)
        return (_a = event2.detail) != null ? _a : event2.target.value;
      else if (el.type === "checkbox") {
        if (Array.isArray(currentValue)) {
          let newValue = modifiers.includes("number") ? safeParseNumber(event2.target.value) : event2.target.value;
          return event2.target.checked ? currentValue.concat([newValue]) : currentValue.filter((el2) => !checkedAttrLooseCompare2(el2, newValue));
        } else {
          return event2.target.checked;
        }
      } else if (el.tagName.toLowerCase() === "select" && el.multiple) {
        return modifiers.includes("number") ? Array.from(event2.target.selectedOptions).map((option) => {
          let rawValue = option.value || option.text;
          return safeParseNumber(rawValue);
        }) : Array.from(event2.target.selectedOptions).map((option) => {
          return option.value || option.text;
        });
      } else {
        let rawValue = event2.target.value;
        return modifiers.includes("number") ? safeParseNumber(rawValue) : modifiers.includes("trim") ? rawValue.trim() : rawValue;
      }
    });
  }
  function safeParseNumber(rawValue) {
    let number = rawValue ? parseFloat(rawValue) : null;
    return isNumeric2(number) ? number : rawValue;
  }
  function checkedAttrLooseCompare2(valueA, valueB) {
    return valueA == valueB;
  }
  function isNumeric2(subject) {
    return !Array.isArray(subject) && !isNaN(subject);
  }
  function isGetterSetter(value) {
    return value !== null && typeof value === "object" && typeof value.get === "function" && typeof value.set === "function";
  }
  directive("cloak", (el) => queueMicrotask(() => mutateDom(() => el.removeAttribute(prefix("cloak")))));
  addInitSelector(() => `[${prefix("init")}]`);
  directive("init", skipDuringClone((el, { expression }, { evaluate: evaluate2 }) => {
    if (typeof expression === "string") {
      return !!expression.trim() && evaluate2(expression, {}, false);
    }
    return evaluate2(expression, {}, false);
  }));
  directive("text", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
    let evaluate2 = evaluateLater2(expression);
    effect3(() => {
      evaluate2((value) => {
        mutateDom(() => {
          el.textContent = value;
        });
      });
    });
  });
  directive("html", (el, { expression }, { effect: effect3, evaluateLater: evaluateLater2 }) => {
    let evaluate2 = evaluateLater2(expression);
    effect3(() => {
      evaluate2((value) => {
        mutateDom(() => {
          el.innerHTML = value;
          el._x_ignoreSelf = true;
          initTree(el);
          delete el._x_ignoreSelf;
        });
      });
    });
  });
  mapAttributes(startingWith(":", into(prefix("bind:"))));
  var handler2 = (el, { value, modifiers, expression, original }, { effect: effect3 }) => {
    if (!value) {
      let bindingProviders = {};
      injectBindingProviders(bindingProviders);
      let getBindings = evaluateLater(el, expression);
      getBindings((bindings) => {
        applyBindingsObject(el, bindings, original);
      }, { scope: bindingProviders });
      return;
    }
    if (value === "key")
      return storeKeyForXFor(el, expression);
    if (el._x_inlineBindings && el._x_inlineBindings[value] && el._x_inlineBindings[value].extract) {
      return;
    }
    let evaluate2 = evaluateLater(el, expression);
    effect3(() => evaluate2((result) => {
      if (result === void 0 && typeof expression === "string" && expression.match(/\./)) {
        result = "";
      }
      mutateDom(() => bind(el, value, result, modifiers));
    }));
  };
  handler2.inline = (el, { value, modifiers, expression }) => {
    if (!value)
      return;
    if (!el._x_inlineBindings)
      el._x_inlineBindings = {};
    el._x_inlineBindings[value] = { expression, extract: false };
  };
  directive("bind", handler2);
  function storeKeyForXFor(el, expression) {
    el._x_keyExpression = expression;
  }
  addRootSelector(() => `[${prefix("data")}]`);
  directive("data", skipDuringClone((el, { expression }, { cleanup: cleanup2 }) => {
    expression = expression === "" ? "{}" : expression;
    let magicContext = {};
    injectMagics(magicContext, el);
    let dataProviderContext = {};
    injectDataProviders(dataProviderContext, magicContext);
    let data2 = evaluate(el, expression, { scope: dataProviderContext });
    if (data2 === void 0 || data2 === true)
      data2 = {};
    injectMagics(data2, el);
    let reactiveData = reactive(data2);
    initInterceptors(reactiveData);
    let undo = addScopeToNode(el, reactiveData);
    reactiveData["init"] && evaluate(el, reactiveData["init"]);
    cleanup2(() => {
      reactiveData["destroy"] && evaluate(el, reactiveData["destroy"]);
      undo();
    });
  }));
  directive("show", (el, { modifiers, expression }, { effect: effect3 }) => {
    let evaluate2 = evaluateLater(el, expression);
    if (!el._x_doHide)
      el._x_doHide = () => {
        mutateDom(() => {
          el.style.setProperty("display", "none", modifiers.includes("important") ? "important" : void 0);
        });
      };
    if (!el._x_doShow)
      el._x_doShow = () => {
        mutateDom(() => {
          if (el.style.length === 1 && el.style.display === "none") {
            el.removeAttribute("style");
          } else {
            el.style.removeProperty("display");
          }
        });
      };
    let hide = () => {
      el._x_doHide();
      el._x_isShown = false;
    };
    let show = () => {
      el._x_doShow();
      el._x_isShown = true;
    };
    let clickAwayCompatibleShow = () => setTimeout(show);
    let toggle = once((value) => value ? show() : hide(), (value) => {
      if (typeof el._x_toggleAndCascadeWithTransitions === "function") {
        el._x_toggleAndCascadeWithTransitions(el, value, show, hide);
      } else {
        value ? clickAwayCompatibleShow() : hide();
      }
    });
    let oldValue;
    let firstTime = true;
    effect3(() => evaluate2((value) => {
      if (!firstTime && value === oldValue)
        return;
      if (modifiers.includes("immediate"))
        value ? clickAwayCompatibleShow() : hide();
      toggle(value);
      oldValue = value;
      firstTime = false;
    }));
  });
  directive("for", (el, { expression }, { effect: effect3, cleanup: cleanup2 }) => {
    let iteratorNames = parseForExpression(expression);
    let evaluateItems = evaluateLater(el, iteratorNames.items);
    let evaluateKey = evaluateLater(el, el._x_keyExpression || "index");
    el._x_prevKeys = [];
    el._x_lookup = {};
    effect3(() => loop(el, iteratorNames, evaluateItems, evaluateKey));
    cleanup2(() => {
      Object.values(el._x_lookup).forEach((el2) => el2.remove());
      delete el._x_prevKeys;
      delete el._x_lookup;
    });
  });
  function loop(el, iteratorNames, evaluateItems, evaluateKey) {
    let isObject2 = (i) => typeof i === "object" && !Array.isArray(i);
    let templateEl = el;
    evaluateItems((items) => {
      if (isNumeric3(items) && items >= 0) {
        items = Array.from(Array(items).keys(), (i) => i + 1);
      }
      if (items === void 0)
        items = [];
      let lookup = el._x_lookup;
      let prevKeys = el._x_prevKeys;
      let scopes = [];
      let keys = [];
      if (isObject2(items)) {
        items = Object.entries(items).map(([key, value]) => {
          let scope2 = getIterationScopeVariables(iteratorNames, value, key, items);
          evaluateKey((value2) => keys.push(value2), { scope: { index: key, ...scope2 } });
          scopes.push(scope2);
        });
      } else {
        for (let i = 0; i < items.length; i++) {
          let scope2 = getIterationScopeVariables(iteratorNames, items[i], i, items);
          evaluateKey((value) => keys.push(value), { scope: { index: i, ...scope2 } });
          scopes.push(scope2);
        }
      }
      let adds = [];
      let moves = [];
      let removes = [];
      let sames = [];
      for (let i = 0; i < prevKeys.length; i++) {
        let key = prevKeys[i];
        if (keys.indexOf(key) === -1)
          removes.push(key);
      }
      prevKeys = prevKeys.filter((key) => !removes.includes(key));
      let lastKey = "template";
      for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let prevIndex = prevKeys.indexOf(key);
        if (prevIndex === -1) {
          prevKeys.splice(i, 0, key);
          adds.push([lastKey, i]);
        } else if (prevIndex !== i) {
          let keyInSpot = prevKeys.splice(i, 1)[0];
          let keyForSpot = prevKeys.splice(prevIndex - 1, 1)[0];
          prevKeys.splice(i, 0, keyForSpot);
          prevKeys.splice(prevIndex, 0, keyInSpot);
          moves.push([keyInSpot, keyForSpot]);
        } else {
          sames.push(key);
        }
        lastKey = key;
      }
      for (let i = 0; i < removes.length; i++) {
        let key = removes[i];
        if (!!lookup[key]._x_effects) {
          lookup[key]._x_effects.forEach(dequeueJob);
        }
        lookup[key].remove();
        lookup[key] = null;
        delete lookup[key];
      }
      for (let i = 0; i < moves.length; i++) {
        let [keyInSpot, keyForSpot] = moves[i];
        let elInSpot = lookup[keyInSpot];
        let elForSpot = lookup[keyForSpot];
        let marker = document.createElement("div");
        mutateDom(() => {
          if (!elForSpot)
            warn(`x-for ":key" is undefined or invalid`, templateEl);
          elForSpot.after(marker);
          elInSpot.after(elForSpot);
          elForSpot._x_currentIfEl && elForSpot.after(elForSpot._x_currentIfEl);
          marker.before(elInSpot);
          elInSpot._x_currentIfEl && elInSpot.after(elInSpot._x_currentIfEl);
          marker.remove();
        });
        elForSpot._x_refreshXForScope(scopes[keys.indexOf(keyForSpot)]);
      }
      for (let i = 0; i < adds.length; i++) {
        let [lastKey2, index2] = adds[i];
        let lastEl = lastKey2 === "template" ? templateEl : lookup[lastKey2];
        if (lastEl._x_currentIfEl)
          lastEl = lastEl._x_currentIfEl;
        let scope2 = scopes[index2];
        let key = keys[index2];
        let clone2 = document.importNode(templateEl.content, true).firstElementChild;
        let reactiveScope = reactive(scope2);
        addScopeToNode(clone2, reactiveScope, templateEl);
        clone2._x_refreshXForScope = (newScope) => {
          Object.entries(newScope).forEach(([key2, value]) => {
            reactiveScope[key2] = value;
          });
        };
        mutateDom(() => {
          lastEl.after(clone2);
          initTree(clone2);
        });
        if (typeof key === "object") {
          warn("x-for key cannot be an object, it must be a string or an integer", templateEl);
        }
        lookup[key] = clone2;
      }
      for (let i = 0; i < sames.length; i++) {
        lookup[sames[i]]._x_refreshXForScope(scopes[keys.indexOf(sames[i])]);
      }
      templateEl._x_prevKeys = keys;
    });
  }
  function parseForExpression(expression) {
    let forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
    let stripParensRE = /^\s*\(|\)\s*$/g;
    let forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
    let inMatch = expression.match(forAliasRE);
    if (!inMatch)
      return;
    let res = {};
    res.items = inMatch[2].trim();
    let item = inMatch[1].replace(stripParensRE, "").trim();
    let iteratorMatch = item.match(forIteratorRE);
    if (iteratorMatch) {
      res.item = item.replace(forIteratorRE, "").trim();
      res.index = iteratorMatch[1].trim();
      if (iteratorMatch[2]) {
        res.collection = iteratorMatch[2].trim();
      }
    } else {
      res.item = item;
    }
    return res;
  }
  function getIterationScopeVariables(iteratorNames, item, index2, items) {
    let scopeVariables = {};
    if (/^\[.*\]$/.test(iteratorNames.item) && Array.isArray(item)) {
      let names = iteratorNames.item.replace("[", "").replace("]", "").split(",").map((i) => i.trim());
      names.forEach((name, i) => {
        scopeVariables[name] = item[i];
      });
    } else if (/^\{.*\}$/.test(iteratorNames.item) && !Array.isArray(item) && typeof item === "object") {
      let names = iteratorNames.item.replace("{", "").replace("}", "").split(",").map((i) => i.trim());
      names.forEach((name) => {
        scopeVariables[name] = item[name];
      });
    } else {
      scopeVariables[iteratorNames.item] = item;
    }
    if (iteratorNames.index)
      scopeVariables[iteratorNames.index] = index2;
    if (iteratorNames.collection)
      scopeVariables[iteratorNames.collection] = items;
    return scopeVariables;
  }
  function isNumeric3(subject) {
    return !Array.isArray(subject) && !isNaN(subject);
  }
  function handler3() {
  }
  handler3.inline = (el, { expression }, { cleanup: cleanup2 }) => {
    let root = closestRoot(el);
    if (!root._x_refs)
      root._x_refs = {};
    root._x_refs[expression] = el;
    cleanup2(() => delete root._x_refs[expression]);
  };
  directive("ref", handler3);
  directive("if", (el, { expression }, { effect: effect3, cleanup: cleanup2 }) => {
    let evaluate2 = evaluateLater(el, expression);
    let show = () => {
      if (el._x_currentIfEl)
        return el._x_currentIfEl;
      let clone2 = el.content.cloneNode(true).firstElementChild;
      addScopeToNode(clone2, {}, el);
      mutateDom(() => {
        el.after(clone2);
        initTree(clone2);
      });
      el._x_currentIfEl = clone2;
      el._x_undoIf = () => {
        walk(clone2, (node) => {
          if (!!node._x_effects) {
            node._x_effects.forEach(dequeueJob);
          }
        });
        clone2.remove();
        delete el._x_currentIfEl;
      };
      return clone2;
    };
    let hide = () => {
      if (!el._x_undoIf)
        return;
      el._x_undoIf();
      delete el._x_undoIf;
    };
    effect3(() => evaluate2((value) => {
      value ? show() : hide();
    }));
    cleanup2(() => el._x_undoIf && el._x_undoIf());
  });
  directive("id", (el, { expression }, { evaluate: evaluate2 }) => {
    let names = evaluate2(expression);
    names.forEach((name) => setIdRoot(el, name));
  });
  mapAttributes(startingWith("@", into(prefix("on:"))));
  directive("on", skipDuringClone((el, { value, modifiers, expression }, { cleanup: cleanup2 }) => {
    let evaluate2 = expression ? evaluateLater(el, expression) : () => {
    };
    if (el.tagName.toLowerCase() === "template") {
      if (!el._x_forwardEvents)
        el._x_forwardEvents = [];
      if (!el._x_forwardEvents.includes(value))
        el._x_forwardEvents.push(value);
    }
    let removeListener = on(el, value, modifiers, (e) => {
      evaluate2(() => {
      }, { scope: { $event: e }, params: [e] });
    });
    cleanup2(() => removeListener());
  }));
  warnMissingPluginDirective("Collapse", "collapse", "collapse");
  warnMissingPluginDirective("Intersect", "intersect", "intersect");
  warnMissingPluginDirective("Focus", "trap", "focus");
  warnMissingPluginDirective("Mask", "mask", "mask");
  function warnMissingPluginDirective(name, directiveName2, slug) {
    directive(directiveName2, (el) => warn(`You can't use [x-${directiveName2}] without first installing the "${name}" plugin here: https://alpinejs.dev/plugins/${slug}`, el));
  }
  alpine_default.setEvaluator(normalEvaluator);
  alpine_default.setReactivityEngine({ reactive: reactive2, effect: effect2, release: stop, raw: toRaw });
  var src_default = alpine_default;
  var module_default = src_default;
  var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
  var js = { exports: {} };
  var defaultOptions;
  var hasRequiredDefaultOptions;
  function requireDefaultOptions() {
    if (hasRequiredDefaultOptions)
      return defaultOptions;
    hasRequiredDefaultOptions = 1;
    defaultOptions = {
      tocSelector: ".js-toc",
      contentSelector: ".js-toc-content",
      headingSelector: "h1, h2, h3",
      ignoreSelector: ".js-toc-ignore",
      hasInnerContainers: false,
      linkClass: "toc-link",
      extraLinkClasses: "",
      activeLinkClass: "is-active-link",
      listClass: "toc-list",
      extraListClasses: "",
      isCollapsedClass: "is-collapsed",
      collapsibleClass: "is-collapsible",
      listItemClass: "toc-list-item",
      activeListItemClass: "is-active-li",
      collapseDepth: 0,
      scrollSmooth: true,
      scrollSmoothDuration: 420,
      scrollSmoothOffset: 0,
      scrollEndCallback: function(e) {
      },
      headingsOffset: 1,
      throttleTimeout: 50,
      positionFixedSelector: null,
      positionFixedClass: "is-position-fixed",
      fixedSidebarOffset: "auto",
      includeHtml: false,
      includeTitleTags: false,
      onClick: function(e) {
      },
      orderedList: true,
      scrollContainer: null,
      skipRendering: false,
      headingLabelCallback: false,
      ignoreHiddenElements: false,
      headingObjectCallback: null,
      basePath: "",
      disableTocScrollSync: false,
      tocScrollOffset: 0
    };
    return defaultOptions;
  }
  var buildHtml;
  var hasRequiredBuildHtml;
  function requireBuildHtml() {
    if (hasRequiredBuildHtml)
      return buildHtml;
    hasRequiredBuildHtml = 1;
    buildHtml = function(options) {
      var forEach = [].forEach;
      var some = [].some;
      var body = document.body;
      var tocElement;
      var currentlyHighlighting = true;
      var SPACE_CHAR = " ";
      function createEl(d, container) {
        var link = container.appendChild(createLink(d));
        if (d.children.length) {
          var list = createList(d.isCollapsed);
          d.children.forEach(function(child) {
            createEl(child, list);
          });
          link.appendChild(list);
        }
      }
      function render(parent, data2) {
        var collapsed = false;
        var container = createList(collapsed);
        data2.forEach(function(d) {
          createEl(d, container);
        });
        tocElement = parent || tocElement;
        if (tocElement === null) {
          return;
        }
        if (tocElement.firstChild) {
          tocElement.removeChild(tocElement.firstChild);
        }
        if (data2.length === 0) {
          return tocElement;
        }
        return tocElement.appendChild(container);
      }
      function createLink(data2) {
        var item = document.createElement("li");
        var a = document.createElement("a");
        if (options.listItemClass) {
          item.setAttribute("class", options.listItemClass);
        }
        if (options.onClick) {
          a.onclick = options.onClick;
        }
        if (options.includeTitleTags) {
          a.setAttribute("title", data2.textContent);
        }
        if (options.includeHtml && data2.childNodes.length) {
          forEach.call(data2.childNodes, function(node) {
            a.appendChild(node.cloneNode(true));
          });
        } else {
          a.textContent = data2.textContent;
        }
        a.setAttribute("href", options.basePath + "#" + data2.id);
        a.setAttribute("class", options.linkClass + SPACE_CHAR + "node-name--" + data2.nodeName + SPACE_CHAR + options.extraLinkClasses);
        item.appendChild(a);
        return item;
      }
      function createList(isCollapsed) {
        var listElement = options.orderedList ? "ol" : "ul";
        var list = document.createElement(listElement);
        var classes = options.listClass + SPACE_CHAR + options.extraListClasses;
        if (isCollapsed) {
          classes = classes + SPACE_CHAR + options.collapsibleClass;
          classes = classes + SPACE_CHAR + options.isCollapsedClass;
        }
        list.setAttribute("class", classes);
        return list;
      }
      function updateFixedSidebarClass() {
        if (options.scrollContainer && document.querySelector(options.scrollContainer)) {
          var top;
          top = document.querySelector(options.scrollContainer).scrollTop;
        } else {
          top = document.documentElement.scrollTop || body.scrollTop;
        }
        var posFixedEl = document.querySelector(options.positionFixedSelector);
        if (options.fixedSidebarOffset === "auto") {
          options.fixedSidebarOffset = tocElement.offsetTop;
        }
        if (top > options.fixedSidebarOffset) {
          if (posFixedEl.className.indexOf(options.positionFixedClass) === -1) {
            posFixedEl.className += SPACE_CHAR + options.positionFixedClass;
          }
        } else {
          posFixedEl.className = posFixedEl.className.split(SPACE_CHAR + options.positionFixedClass).join("");
        }
      }
      function getHeadingTopPos(obj) {
        var position = 0;
        if (obj !== null) {
          position = obj.offsetTop;
          if (options.hasInnerContainers) {
            position += getHeadingTopPos(obj.offsetParent);
          }
        }
        return position;
      }
      function updateToc(headingsArray) {
        if (options.scrollContainer && document.querySelector(options.scrollContainer)) {
          var top;
          top = document.querySelector(options.scrollContainer).scrollTop;
        } else {
          top = document.documentElement.scrollTop || body.scrollTop;
        }
        if (options.positionFixedSelector) {
          updateFixedSidebarClass();
        }
        var headings = headingsArray;
        var topHeader;
        if (currentlyHighlighting && tocElement !== null && headings.length > 0) {
          some.call(headings, function(heading, i) {
            if (getHeadingTopPos(heading) > top + options.headingsOffset + 10) {
              var index2 = i === 0 ? i : i - 1;
              topHeader = headings[index2];
              return true;
            } else if (i === headings.length - 1) {
              topHeader = headings[headings.length - 1];
              return true;
            }
          });
          var oldActiveTocLink = tocElement.querySelector("." + options.activeLinkClass);
          var activeTocLink = tocElement.querySelector("." + options.linkClass + ".node-name--" + topHeader.nodeName + '[href="' + options.basePath + "#" + topHeader.id.replace(/([ #;&,.+*~':"!^$[\]()=>|/\\@])/g, "\\$1") + '"]');
          if (oldActiveTocLink === activeTocLink) {
            return;
          }
          var tocLinks = tocElement.querySelectorAll("." + options.linkClass);
          forEach.call(tocLinks, function(tocLink) {
            tocLink.className = tocLink.className.split(SPACE_CHAR + options.activeLinkClass).join("");
          });
          var tocLis = tocElement.querySelectorAll("." + options.listItemClass);
          forEach.call(tocLis, function(tocLi) {
            tocLi.className = tocLi.className.split(SPACE_CHAR + options.activeListItemClass).join("");
          });
          if (activeTocLink && activeTocLink.className.indexOf(options.activeLinkClass) === -1) {
            activeTocLink.className += SPACE_CHAR + options.activeLinkClass;
          }
          var li = activeTocLink && activeTocLink.parentNode;
          if (li && li.className.indexOf(options.activeListItemClass) === -1) {
            li.className += SPACE_CHAR + options.activeListItemClass;
          }
          var tocLists = tocElement.querySelectorAll("." + options.listClass + "." + options.collapsibleClass);
          forEach.call(tocLists, function(list) {
            if (list.className.indexOf(options.isCollapsedClass) === -1) {
              list.className += SPACE_CHAR + options.isCollapsedClass;
            }
          });
          if (activeTocLink && activeTocLink.nextSibling && activeTocLink.nextSibling.className.indexOf(options.isCollapsedClass) !== -1) {
            activeTocLink.nextSibling.className = activeTocLink.nextSibling.className.split(SPACE_CHAR + options.isCollapsedClass).join("");
          }
          removeCollapsedFromParents(activeTocLink && activeTocLink.parentNode.parentNode);
        }
      }
      function removeCollapsedFromParents(element) {
        if (element && element.className.indexOf(options.collapsibleClass) !== -1 && element.className.indexOf(options.isCollapsedClass) !== -1) {
          element.className = element.className.split(SPACE_CHAR + options.isCollapsedClass).join("");
          return removeCollapsedFromParents(element.parentNode.parentNode);
        }
        return element;
      }
      function disableTocAnimation(event2) {
        var target = event2.target || event2.srcElement;
        if (typeof target.className !== "string" || target.className.indexOf(options.linkClass) === -1) {
          return;
        }
        currentlyHighlighting = false;
      }
      function enableTocAnimation() {
        currentlyHighlighting = true;
      }
      return {
        enableTocAnimation,
        disableTocAnimation,
        render,
        updateToc
      };
    };
    return buildHtml;
  }
  var parseContent;
  var hasRequiredParseContent;
  function requireParseContent() {
    if (hasRequiredParseContent)
      return parseContent;
    hasRequiredParseContent = 1;
    parseContent = function parseContent2(options) {
      var reduce = [].reduce;
      function getLastItem(array) {
        return array[array.length - 1];
      }
      function getHeadingLevel(heading) {
        return +heading.nodeName.toUpperCase().replace("H", "");
      }
      function isHTMLElement(maybeElement) {
        try {
          return maybeElement instanceof window.HTMLElement || maybeElement instanceof window.parent.HTMLElement;
        } catch (e) {
          return maybeElement instanceof window.HTMLElement;
        }
      }
      function getHeadingObject(heading) {
        if (!isHTMLElement(heading))
          return heading;
        if (options.ignoreHiddenElements && (!heading.offsetHeight || !heading.offsetParent)) {
          return null;
        }
        const headingLabel = heading.getAttribute("data-heading-label") || (options.headingLabelCallback ? String(options.headingLabelCallback(heading.textContent)) : heading.textContent.trim());
        var obj = {
          id: heading.id,
          children: [],
          nodeName: heading.nodeName,
          headingLevel: getHeadingLevel(heading),
          textContent: headingLabel
        };
        if (options.includeHtml) {
          obj.childNodes = heading.childNodes;
        }
        if (options.headingObjectCallback) {
          return options.headingObjectCallback(obj, heading);
        }
        return obj;
      }
      function addNode(node, nest) {
        var obj = getHeadingObject(node);
        var level = obj.headingLevel;
        var array = nest;
        var lastItem = getLastItem(array);
        var lastItemLevel = lastItem ? lastItem.headingLevel : 0;
        var counter = level - lastItemLevel;
        while (counter > 0) {
          lastItem = getLastItem(array);
          if (lastItem && level === lastItem.headingLevel) {
            break;
          } else if (lastItem && lastItem.children !== void 0) {
            array = lastItem.children;
          }
          counter--;
        }
        if (level >= options.collapseDepth) {
          obj.isCollapsed = true;
        }
        array.push(obj);
        return array;
      }
      function selectHeadings(contentElement, headingSelector) {
        var selectors = headingSelector;
        if (options.ignoreSelector) {
          selectors = headingSelector.split(",").map(function mapSelectors(selector) {
            return selector.trim() + ":not(" + options.ignoreSelector + ")";
          });
        }
        try {
          return contentElement.querySelectorAll(selectors);
        } catch (e) {
          console.warn("Headers not found with selector: " + selectors);
          return null;
        }
      }
      function nestHeadingsArray(headingsArray) {
        return reduce.call(headingsArray, function reducer(prev, curr) {
          var currentHeading = getHeadingObject(curr);
          if (currentHeading) {
            addNode(currentHeading, prev.nest);
          }
          return prev;
        }, {
          nest: []
        });
      }
      return {
        nestHeadingsArray,
        selectHeadings
      };
    };
    return parseContent;
  }
  var updateTocScroll;
  var hasRequiredUpdateTocScroll;
  function requireUpdateTocScroll() {
    if (hasRequiredUpdateTocScroll)
      return updateTocScroll;
    hasRequiredUpdateTocScroll = 1;
    updateTocScroll = function updateTocScroll2(options) {
      var toc = options.tocElement || document.querySelector(options.tocSelector);
      if (toc && toc.scrollHeight > toc.clientHeight) {
        var activeItem = toc.querySelector("." + options.activeListItemClass);
        if (activeItem) {
          toc.scrollTop = activeItem.offsetTop - options.tocScrollOffset;
        }
      }
    };
    return updateTocScroll;
  }
  var scrollSmooth = {};
  var hasRequiredScrollSmooth;
  function requireScrollSmooth() {
    if (hasRequiredScrollSmooth)
      return scrollSmooth;
    hasRequiredScrollSmooth = 1;
    scrollSmooth.initSmoothScrolling = initSmoothScrolling;
    function initSmoothScrolling(options) {
      var duration = options.duration;
      var offset = options.offset;
      var pageUrl = location.hash ? stripHash(location.href) : location.href;
      delegatedLinkHijacking();
      function delegatedLinkHijacking() {
        document.body.addEventListener("click", onClick, false);
        function onClick(e) {
          if (!isInPageLink(e.target) || e.target.className.indexOf("no-smooth-scroll") > -1 || e.target.href.charAt(e.target.href.length - 2) === "#" && e.target.href.charAt(e.target.href.length - 1) === "!" || e.target.className.indexOf(options.linkClass) === -1) {
            return;
          }
          jump(e.target.hash, {
            duration,
            offset,
            callback: function() {
              setFocus(e.target.hash);
            }
          });
        }
      }
      function isInPageLink(n) {
        return n.tagName.toLowerCase() === "a" && (n.hash.length > 0 || n.href.charAt(n.href.length - 1) === "#") && (stripHash(n.href) === pageUrl || stripHash(n.href) + "#" === pageUrl);
      }
      function stripHash(url) {
        return url.slice(0, url.lastIndexOf("#"));
      }
      function setFocus(hash2) {
        var element = document.getElementById(hash2.substring(1));
        if (element) {
          if (!/^(?:a|select|input|button|textarea)$/i.test(element.tagName)) {
            element.tabIndex = -1;
          }
          element.focus();
        }
      }
    }
    function jump(target, options) {
      var start2 = window.pageYOffset;
      var opt = {
        duration: options.duration,
        offset: options.offset || 0,
        callback: options.callback,
        easing: options.easing || easeInOutQuad
      };
      var tgt = document.querySelector('[id="' + decodeURI(target).split("#").join("") + '"]') || document.querySelector('[id="' + target.split("#").join("") + '"]');
      var distance = typeof target === "string" ? opt.offset + (target ? tgt && tgt.getBoundingClientRect().top || 0 : -(document.documentElement.scrollTop || document.body.scrollTop)) : target;
      var duration = typeof opt.duration === "function" ? opt.duration(distance) : opt.duration;
      var timeStart;
      var timeElapsed;
      requestAnimationFrame(function(time) {
        timeStart = time;
        loop2(time);
      });
      function loop2(time) {
        timeElapsed = time - timeStart;
        window.scrollTo(0, opt.easing(timeElapsed, start2, distance, duration));
        if (timeElapsed < duration) {
          requestAnimationFrame(loop2);
        } else {
          end();
        }
      }
      function end() {
        window.scrollTo(0, start2 + distance);
        if (typeof opt.callback === "function") {
          opt.callback();
        }
      }
      function easeInOutQuad(t, b, c, d) {
        t /= d / 2;
        if (t < 1)
          return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
      }
    }
    return scrollSmooth;
  }
  (function(module, exports2) {
    (function(root, factory) {
      {
        module.exports = factory(root);
      }
    })(typeof commonjsGlobal !== "undefined" ? commonjsGlobal : window || commonjsGlobal, function(root) {
      var defaultOptions2 = requireDefaultOptions();
      var options = {};
      var tocbot = {};
      var BuildHtml = requireBuildHtml();
      var ParseContent = requireParseContent();
      var updateTocScroll2 = requireUpdateTocScroll();
      var buildHtml2;
      var parseContent2;
      var supports = !!root && !!root.document && !!root.document.querySelector && !!root.addEventListener;
      if (typeof window === "undefined" && !supports) {
        return;
      }
      var headingsArray;
      var hasOwnProperty2 = Object.prototype.hasOwnProperty;
      function extend2() {
        var target = {};
        for (var i = 0; i < arguments.length; i++) {
          var source = arguments[i];
          for (var key in source) {
            if (hasOwnProperty2.call(source, key)) {
              target[key] = source[key];
            }
          }
        }
        return target;
      }
      function throttle2(fn, threshold, scope2) {
        threshold || (threshold = 250);
        var last;
        var deferTimer;
        return function() {
          var context = scope2 || this;
          var now = +new Date();
          var args = arguments;
          if (last && now < last + threshold) {
            clearTimeout(deferTimer);
            deferTimer = setTimeout(function() {
              last = now;
              fn.apply(context, args);
            }, threshold);
          } else {
            last = now;
            fn.apply(context, args);
          }
        };
      }
      function getContentElement(options2) {
        try {
          return options2.contentElement || document.querySelector(options2.contentSelector);
        } catch (e) {
          console.warn("Contents element not found: " + options2.contentSelector);
          return null;
        }
      }
      function getTocElement(options2) {
        try {
          return options2.tocElement || document.querySelector(options2.tocSelector);
        } catch (e) {
          console.warn("TOC element not found: " + options2.tocSelector);
          return null;
        }
      }
      tocbot.destroy = function() {
        var tocElement = getTocElement(options);
        if (tocElement === null) {
          return;
        }
        if (!options.skipRendering) {
          if (tocElement) {
            tocElement.innerHTML = "";
          }
        }
        if (options.scrollContainer && document.querySelector(options.scrollContainer)) {
          document.querySelector(options.scrollContainer).removeEventListener("scroll", this._scrollListener, false);
          document.querySelector(options.scrollContainer).removeEventListener("resize", this._scrollListener, false);
          if (buildHtml2) {
            document.querySelector(options.scrollContainer).removeEventListener("click", this._clickListener, false);
          }
        } else {
          document.removeEventListener("scroll", this._scrollListener, false);
          document.removeEventListener("resize", this._scrollListener, false);
          if (buildHtml2) {
            document.removeEventListener("click", this._clickListener, false);
          }
        }
      };
      tocbot.init = function(customOptions) {
        if (!supports) {
          return;
        }
        options = extend2(defaultOptions2, customOptions || {});
        this.options = options;
        this.state = {};
        if (options.scrollSmooth) {
          options.duration = options.scrollSmoothDuration;
          options.offset = options.scrollSmoothOffset;
          tocbot.scrollSmooth = requireScrollSmooth().initSmoothScrolling(options);
        }
        buildHtml2 = BuildHtml(options);
        parseContent2 = ParseContent(options);
        this._buildHtml = buildHtml2;
        this._parseContent = parseContent2;
        this._headingsArray = headingsArray;
        tocbot.destroy();
        var contentElement = getContentElement(options);
        if (contentElement === null) {
          return;
        }
        var tocElement = getTocElement(options);
        if (tocElement === null) {
          return;
        }
        headingsArray = parseContent2.selectHeadings(contentElement, options.headingSelector);
        if (headingsArray === null) {
          return;
        }
        var nestedHeadingsObj = parseContent2.nestHeadingsArray(headingsArray);
        var nestedHeadings = nestedHeadingsObj.nest;
        if (!options.skipRendering) {
          buildHtml2.render(tocElement, nestedHeadings);
        }
        this._scrollListener = throttle2(function(e) {
          buildHtml2.updateToc(headingsArray);
          !options.disableTocScrollSync && updateTocScroll2(options);
          var isTop = e && e.target && e.target.scrollingElement && e.target.scrollingElement.scrollTop === 0;
          if (e && (e.eventPhase === 0 || e.currentTarget === null) || isTop) {
            buildHtml2.updateToc(headingsArray);
            if (options.scrollEndCallback) {
              options.scrollEndCallback(e);
            }
          }
        }, options.throttleTimeout);
        this._scrollListener();
        if (options.scrollContainer && document.querySelector(options.scrollContainer)) {
          document.querySelector(options.scrollContainer).addEventListener("scroll", this._scrollListener, false);
          document.querySelector(options.scrollContainer).addEventListener("resize", this._scrollListener, false);
        } else {
          document.addEventListener("scroll", this._scrollListener, false);
          document.addEventListener("resize", this._scrollListener, false);
        }
        var timeout = null;
        this._clickListener = throttle2(function(event2) {
          if (options.scrollSmooth) {
            buildHtml2.disableTocAnimation(event2);
          }
          buildHtml2.updateToc(headingsArray);
          timeout && clearTimeout(timeout);
          timeout = setTimeout(function() {
            buildHtml2.enableTocAnimation();
          }, options.scrollSmoothDuration);
        }, options.throttleTimeout);
        if (options.scrollContainer && document.querySelector(options.scrollContainer)) {
          document.querySelector(options.scrollContainer).addEventListener("click", this._clickListener, false);
        } else {
          document.addEventListener("click", this._clickListener, false);
        }
        return this;
      };
      tocbot.refresh = function(customOptions) {
        tocbot.destroy();
        tocbot.init(customOptions || this.options);
      };
      root.tocbot = tocbot;
      return tocbot;
    });
  })(js);
  const animate = "";
  const ballAtom_min = "";
  const iconfont = "";
  const obsidian = "";
  const theme = "";
  console.log(
    "\n %c MetingJS v1.2.0 %c https://github.com/metowolf/MetingJS \n",
    "color: #fadfa3; background: #030307; padding:5px 0;",
    "background: #fadfa3; padding:5px 0;"
  );
  var aplayers = [], loadMeting = function() {
    function a(a2, b2) {
      var c2 = {
        container: a2,
        audio: b2,
        mini: null,
        fixed: null,
        autoplay: false,
        mutex: true,
        lrcType: 3,
        listFolded: false,
        preload: "auto",
        theme: "#2980b9",
        loop: "all",
        order: "list",
        volume: null,
        listMaxHeight: null,
        customAudioType: null,
        storageName: "metingjs"
      };
      if (b2.length) {
        b2[0].lrc || (c2.lrcType = 0);
        var d2 = {};
        for (var e2 in c2) {
          var f2 = e2.toLowerCase();
          (a2.dataset.hasOwnProperty(f2) || a2.dataset.hasOwnProperty(e2) || null !== c2[e2]) && (d2[e2] = a2.dataset[f2] || a2.dataset[e2] || c2[e2], ("true" === d2[e2] || "false" === d2[e2]) && (d2[e2] = "true" == d2[e2]));
        }
        aplayers.push(new APlayer(d2));
      }
    }
    var b = "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r";
    "undefined" != typeof meting_api && (b = meting_api);
    for (var f = 0; f < aplayers.length; f++)
      try {
        aplayers[f].destroy();
      } catch (a2) {
        console.log(a2);
      }
    aplayers = [];
    for (var c = document.querySelectorAll(".aplayer"), d = function() {
      var d2 = c[e], f2 = d2.dataset.id;
      if (f2) {
        var g = d2.dataset.api || b;
        g = g.replace(":server", d2.dataset.server), g = g.replace(":type", d2.dataset.type), g = g.replace(":id", d2.dataset.id), g = g.replace(":auth", d2.dataset.auth), g = g.replace(":r", Math.random());
        var h = new XMLHttpRequest();
        h.onreadystatechange = function() {
          if (4 === h.readyState && (200 <= h.status && 300 > h.status || 304 === h.status)) {
            var b2 = JSON.parse(h.responseText);
            a(d2, b2);
          }
        }, h.open("get", g, true), h.send(null);
      } else if (d2.dataset.url) {
        var i = [
          {
            name: d2.dataset.name || d2.dataset.title || "Audio name",
            artist: d2.dataset.artist || d2.dataset.author || "Audio artist",
            url: d2.dataset.url,
            cover: d2.dataset.cover || d2.dataset.pic,
            lrc: d2.dataset.lrc,
            type: d2.dataset.type || "auto"
          }
        ];
        a(d2, i);
      }
    }, e = 0; e < c.length; e++)
      d();
  };
  document.addEventListener("DOMContentLoaded", loadMeting, false);
  /*! jQuery v1.7 jquery.com | jquery.org/license */
  (function(a, b) {
    function cA(a2) {
      return f.isWindow(a2) ? a2 : a2.nodeType === 9 ? a2.defaultView || a2.parentWindow : false;
    }
    function cx(a2) {
      if (!cm[a2]) {
        var b2 = c.body, d2 = f("<" + a2 + ">").appendTo(b2), e2 = d2.css("display");
        d2.remove();
        if (e2 === "none" || e2 === "") {
          cn || (cn = c.createElement("iframe"), cn.frameBorder = cn.width = cn.height = 0), b2.appendChild(cn);
          if (!co || !cn.createElement)
            co = (cn.contentWindow || cn.contentDocument).document, co.write((c.compatMode === "CSS1Compat" ? "<!doctype html>" : "") + "<html><body>"), co.close();
          d2 = co.createElement(a2), co.body.appendChild(d2), e2 = f.css(d2, "display"), b2.removeChild(cn);
        }
        cm[a2] = e2;
      }
      return cm[a2];
    }
    function cw(a2, b2) {
      var c2 = {};
      f.each(cs.concat.apply([], cs.slice(0, b2)), function() {
        c2[this] = a2;
      });
      return c2;
    }
    function cv() {
      ct = b;
    }
    function cu() {
      setTimeout(cv, 0);
      return ct = f.now();
    }
    function cl() {
      try {
        return new a.ActiveXObject("Microsoft.XMLHTTP");
      } catch (b2) {
      }
    }
    function ck() {
      try {
        return new a.XMLHttpRequest();
      } catch (b2) {
      }
    }
    function ce(a2, c2) {
      a2.dataFilter && (c2 = a2.dataFilter(c2, a2.dataType));
      var d2 = a2.dataTypes, e2 = {}, g2, h2, i2 = d2.length, j2, k2 = d2[0], l2, m2, n2, o2, p2;
      for (g2 = 1; g2 < i2; g2++) {
        if (g2 === 1)
          for (h2 in a2.converters)
            typeof h2 == "string" && (e2[h2.toLowerCase()] = a2.converters[h2]);
        l2 = k2, k2 = d2[g2];
        if (k2 === "*")
          k2 = l2;
        else if (l2 !== "*" && l2 !== k2) {
          m2 = l2 + " " + k2, n2 = e2[m2] || e2["* " + k2];
          if (!n2) {
            p2 = b;
            for (o2 in e2) {
              j2 = o2.split(" ");
              if (j2[0] === l2 || j2[0] === "*") {
                p2 = e2[j2[1] + " " + k2];
                if (p2) {
                  o2 = e2[o2], o2 === true ? n2 = p2 : p2 === true && (n2 = o2);
                  break;
                }
              }
            }
          }
          !n2 && !p2 && f.error("No conversion from " + m2.replace(" ", " to ")), n2 !== true && (c2 = n2 ? n2(c2) : p2(o2(c2)));
        }
      }
      return c2;
    }
    function cd(a2, c2, d2) {
      var e2 = a2.contents, f2 = a2.dataTypes, g2 = a2.responseFields, h2, i2, j2, k2;
      for (i2 in g2)
        i2 in d2 && (c2[g2[i2]] = d2[i2]);
      while (f2[0] === "*")
        f2.shift(), h2 === b && (h2 = a2.mimeType || c2.getResponseHeader("content-type"));
      if (h2) {
        for (i2 in e2)
          if (e2[i2] && e2[i2].test(h2)) {
            f2.unshift(i2);
            break;
          }
      }
      if (f2[0] in d2)
        j2 = f2[0];
      else {
        for (i2 in d2) {
          if (!f2[0] || a2.converters[i2 + " " + f2[0]]) {
            j2 = i2;
            break;
          }
          k2 || (k2 = i2);
        }
        j2 = j2 || k2;
      }
      if (j2) {
        j2 !== f2[0] && f2.unshift(j2);
        return d2[j2];
      }
    }
    function cc(a2, b2, c2, d2) {
      if (f.isArray(b2))
        f.each(b2, function(b3, e3) {
          c2 || bG.test(a2) ? d2(a2, e3) : cc(a2 + "[" + (typeof e3 == "object" || f.isArray(e3) ? b3 : "") + "]", e3, c2, d2);
        });
      else if (!c2 && b2 != null && typeof b2 == "object")
        for (var e2 in b2)
          cc(a2 + "[" + e2 + "]", b2[e2], c2, d2);
      else
        d2(a2, b2);
    }
    function cb(a2, c2) {
      var d2, e2, g2 = f.ajaxSettings.flatOptions || {};
      for (d2 in c2)
        c2[d2] !== b && ((g2[d2] ? a2 : e2 || (e2 = {}))[d2] = c2[d2]);
      e2 && f.extend(true, a2, e2);
    }
    function ca(a2, c2, d2, e2, f2, g2) {
      f2 = f2 || c2.dataTypes[0], g2 = g2 || {}, g2[f2] = true;
      var h2 = a2[f2], i2 = 0, j2 = h2 ? h2.length : 0, k2 = a2 === bV, l2;
      for (; i2 < j2 && (k2 || !l2); i2++)
        l2 = h2[i2](c2, d2, e2), typeof l2 == "string" && (!k2 || g2[l2] ? l2 = b : (c2.dataTypes.unshift(l2), l2 = ca(a2, c2, d2, e2, l2, g2)));
      (k2 || !l2) && !g2["*"] && (l2 = ca(a2, c2, d2, e2, "*", g2));
      return l2;
    }
    function b_(a2) {
      return function(b2, c2) {
        typeof b2 != "string" && (c2 = b2, b2 = "*");
        if (f.isFunction(c2)) {
          var d2 = b2.toLowerCase().split(bR), e2 = 0, g2 = d2.length, h2, i2, j2;
          for (; e2 < g2; e2++)
            h2 = d2[e2], j2 = /^\+/.test(h2), j2 && (h2 = h2.substr(1) || "*"), i2 = a2[h2] = a2[h2] || [], i2[j2 ? "unshift" : "push"](c2);
        }
      };
    }
    function bE(a2, b2, c2) {
      var d2 = b2 === "width" ? a2.offsetWidth : a2.offsetHeight, e2 = b2 === "width" ? bz : bA;
      if (d2 > 0) {
        c2 !== "border" && f.each(e2, function() {
          c2 || (d2 -= parseFloat(f.css(a2, "padding" + this)) || 0), c2 === "margin" ? d2 += parseFloat(f.css(a2, c2 + this)) || 0 : d2 -= parseFloat(f.css(a2, "border" + this + "Width")) || 0;
        });
        return d2 + "px";
      }
      d2 = bB(a2, b2, b2);
      if (d2 < 0 || d2 == null)
        d2 = a2.style[b2] || 0;
      d2 = parseFloat(d2) || 0, c2 && f.each(e2, function() {
        d2 += parseFloat(f.css(a2, "padding" + this)) || 0, c2 !== "padding" && (d2 += parseFloat(f.css(a2, "border" + this + "Width")) || 0), c2 === "margin" && (d2 += parseFloat(f.css(a2, c2 + this)) || 0);
      });
      return d2 + "px";
    }
    function br(a2, b2) {
      b2.src ? f.ajax({ url: b2.src, async: false, dataType: "script" }) : f.globalEval((b2.text || b2.textContent || b2.innerHTML || "").replace(bi, "/*$0*/")), b2.parentNode && b2.parentNode.removeChild(b2);
    }
    function bq(a2) {
      var b2 = (a2.nodeName || "").toLowerCase();
      b2 === "input" ? bp(a2) : b2 !== "script" && typeof a2.getElementsByTagName != "undefined" && f.grep(a2.getElementsByTagName("input"), bp);
    }
    function bp(a2) {
      if (a2.type === "checkbox" || a2.type === "radio")
        a2.defaultChecked = a2.checked;
    }
    function bo(a2) {
      return typeof a2.getElementsByTagName != "undefined" ? a2.getElementsByTagName("*") : typeof a2.querySelectorAll != "undefined" ? a2.querySelectorAll("*") : [];
    }
    function bn(a2, b2) {
      var c2;
      if (b2.nodeType === 1) {
        b2.clearAttributes && b2.clearAttributes(), b2.mergeAttributes && b2.mergeAttributes(a2), c2 = b2.nodeName.toLowerCase();
        if (c2 === "object")
          b2.outerHTML = a2.outerHTML;
        else if (c2 !== "input" || a2.type !== "checkbox" && a2.type !== "radio") {
          if (c2 === "option")
            b2.selected = a2.defaultSelected;
          else if (c2 === "input" || c2 === "textarea")
            b2.defaultValue = a2.defaultValue;
        } else
          a2.checked && (b2.defaultChecked = b2.checked = a2.checked), b2.value !== a2.value && (b2.value = a2.value);
        b2.removeAttribute(f.expando);
      }
    }
    function bm(a2, b2) {
      if (b2.nodeType === 1 && !!f.hasData(a2)) {
        var c2, d2, e2, g2 = f._data(a2), h2 = f._data(b2, g2), i2 = g2.events;
        if (i2) {
          delete h2.handle, h2.events = {};
          for (c2 in i2)
            for (d2 = 0, e2 = i2[c2].length; d2 < e2; d2++)
              f.event.add(b2, c2 + (i2[c2][d2].namespace ? "." : "") + i2[c2][d2].namespace, i2[c2][d2], i2[c2][d2].data);
        }
        h2.data && (h2.data = f.extend({}, h2.data));
      }
    }
    function bl(a2, b2) {
      return f.nodeName(a2, "table") ? a2.getElementsByTagName("tbody")[0] || a2.appendChild(a2.ownerDocument.createElement("tbody")) : a2;
    }
    function X(a2) {
      var b2 = Y.split(" "), c2 = a2.createDocumentFragment();
      if (c2.createElement)
        while (b2.length)
          c2.createElement(b2.pop());
      return c2;
    }
    function W(a2, b2, c2) {
      b2 = b2 || 0;
      if (f.isFunction(b2))
        return f.grep(a2, function(a3, d3) {
          var e2 = !!b2.call(a3, d3, a3);
          return e2 === c2;
        });
      if (b2.nodeType)
        return f.grep(a2, function(a3, d3) {
          return a3 === b2 === c2;
        });
      if (typeof b2 == "string") {
        var d2 = f.grep(a2, function(a3) {
          return a3.nodeType === 1;
        });
        if (R.test(b2))
          return f.filter(b2, d2, !c2);
        b2 = f.filter(b2, d2);
      }
      return f.grep(a2, function(a3, d3) {
        return f.inArray(a3, b2) >= 0 === c2;
      });
    }
    function V(a2) {
      return !a2 || !a2.parentNode || a2.parentNode.nodeType === 11;
    }
    function N() {
      return true;
    }
    function M() {
      return false;
    }
    function n(a2, b2, c2) {
      var d2 = b2 + "defer", e2 = b2 + "queue", g2 = b2 + "mark", h2 = f._data(a2, d2);
      h2 && (c2 === "queue" || !f._data(a2, e2)) && (c2 === "mark" || !f._data(a2, g2)) && setTimeout(function() {
        !f._data(a2, e2) && !f._data(a2, g2) && (f.removeData(a2, d2, true), h2.fire());
      }, 0);
    }
    function m(a2) {
      for (var b2 in a2) {
        if (b2 === "data" && f.isEmptyObject(a2[b2]))
          continue;
        if (b2 !== "toJSON")
          return false;
      }
      return true;
    }
    function l(a2, c2, d2) {
      if (d2 === b && a2.nodeType === 1) {
        var e2 = "data-" + c2.replace(k, "-$1").toLowerCase();
        d2 = a2.getAttribute(e2);
        if (typeof d2 == "string") {
          try {
            d2 = d2 === "true" ? true : d2 === "false" ? false : d2 === "null" ? null : f.isNumeric(d2) ? parseFloat(d2) : j.test(d2) ? f.parseJSON(d2) : d2;
          } catch (g2) {
          }
          f.data(a2, c2, d2);
        } else
          d2 = b;
      }
      return d2;
    }
    function h(a2) {
      var b2 = g[a2] = {}, c2, d2;
      a2 = a2.split(/\s+/);
      for (c2 = 0, d2 = a2.length; c2 < d2; c2++)
        b2[a2[c2]] = true;
      return b2;
    }
    var c = a.document, d = a.navigator, e = a.location, f = function() {
      function K2() {
        if (!e2.isReady) {
          try {
            c.documentElement.doScroll("left");
          } catch (a2) {
            setTimeout(K2, 1);
            return;
          }
          e2.ready();
        }
      }
      var e2 = function(a2, b2) {
        return new e2.fn.init(a2, b2, h2);
      }, f2 = a.jQuery, g2 = a.$, h2, i2 = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/, j2 = /\S/, k2 = /^\s+/, l2 = /\s+$/, m2 = /\d/, n2 = /^<(\w+)\s*\/?>(?:<\/\1>)?$/, o2 = /^[\],:{}\s]*$/, p2 = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, q2 = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, r2 = /(?:^|:|,)(?:\s*\[)+/g, s2 = /(webkit)[ \/]([\w.]+)/, t2 = /(opera)(?:.*version)?[ \/]([\w.]+)/, u2 = /(msie) ([\w.]+)/, v2 = /(mozilla)(?:.*? rv:([\w.]+))?/, w2 = /-([a-z]|[0-9])/gi, x2 = /^-ms-/, y2 = function(a2, b2) {
        return (b2 + "").toUpperCase();
      }, z = d.userAgent, A2, B, C, D = Object.prototype.toString, E2 = Object.prototype.hasOwnProperty, F2 = Array.prototype.push, G2 = Array.prototype.slice, H2 = String.prototype.trim, I2 = Array.prototype.indexOf, J2 = {};
      e2.fn = e2.prototype = {
        constructor: e2,
        init: function(a2, d2, f3) {
          var g3, h3, j3, k3;
          if (!a2)
            return this;
          if (a2.nodeType) {
            this.context = this[0] = a2, this.length = 1;
            return this;
          }
          if (a2 === "body" && !d2 && c.body) {
            this.context = c, this[0] = c.body, this.selector = a2, this.length = 1;
            return this;
          }
          if (typeof a2 == "string") {
            a2.charAt(0) !== "<" || a2.charAt(a2.length - 1) !== ">" || a2.length < 3 ? g3 = i2.exec(a2) : g3 = [null, a2, null];
            if (g3 && (g3[1] || !d2)) {
              if (g3[1]) {
                d2 = d2 instanceof e2 ? d2[0] : d2, k3 = d2 ? d2.ownerDocument || d2 : c, j3 = n2.exec(a2), j3 ? e2.isPlainObject(d2) ? (a2 = [c.createElement(j3[1])], e2.fn.attr.call(a2, d2, true)) : a2 = [k3.createElement(j3[1])] : (j3 = e2.buildFragment([g3[1]], [k3]), a2 = (j3.cacheable ? e2.clone(j3.fragment) : j3.fragment).childNodes);
                return e2.merge(this, a2);
              }
              h3 = c.getElementById(g3[2]);
              if (h3 && h3.parentNode) {
                if (h3.id !== g3[2])
                  return f3.find(a2);
                this.length = 1, this[0] = h3;
              }
              this.context = c, this.selector = a2;
              return this;
            }
            return !d2 || d2.jquery ? (d2 || f3).find(a2) : this.constructor(d2).find(a2);
          }
          if (e2.isFunction(a2))
            return f3.ready(a2);
          a2.selector !== b && (this.selector = a2.selector, this.context = a2.context);
          return e2.makeArray(a2, this);
        },
        selector: "",
        jquery: "1.7",
        length: 0,
        size: function() {
          return this.length;
        },
        toArray: function() {
          return G2.call(this, 0);
        },
        get: function(a2) {
          return a2 == null ? this.toArray() : a2 < 0 ? this[this.length + a2] : this[a2];
        },
        pushStack: function(a2, b2, c2) {
          var d2 = this.constructor();
          e2.isArray(a2) ? F2.apply(d2, a2) : e2.merge(d2, a2), d2.prevObject = this, d2.context = this.context, b2 === "find" ? d2.selector = this.selector + (this.selector ? " " : "") + c2 : b2 && (d2.selector = this.selector + "." + b2 + "(" + c2 + ")");
          return d2;
        },
        each: function(a2, b2) {
          return e2.each(this, a2, b2);
        },
        ready: function(a2) {
          e2.bindReady(), B.add(a2);
          return this;
        },
        eq: function(a2) {
          return a2 === -1 ? this.slice(a2) : this.slice(a2, +a2 + 1);
        },
        first: function() {
          return this.eq(0);
        },
        last: function() {
          return this.eq(-1);
        },
        slice: function() {
          return this.pushStack(G2.apply(this, arguments), "slice", G2.call(arguments).join(","));
        },
        map: function(a2) {
          return this.pushStack(
            e2.map(this, function(b2, c2) {
              return a2.call(b2, c2, b2);
            })
          );
        },
        end: function() {
          return this.prevObject || this.constructor(null);
        },
        push: F2,
        sort: [].sort,
        splice: [].splice
      }, e2.fn.init.prototype = e2.fn, e2.extend = e2.fn.extend = function() {
        var a2, c2, d2, f3, g3, h3, i3 = arguments[0] || {}, j3 = 1, k3 = arguments.length, l3 = false;
        typeof i3 == "boolean" && (l3 = i3, i3 = arguments[1] || {}, j3 = 2), typeof i3 != "object" && !e2.isFunction(i3) && (i3 = {}), k3 === j3 && (i3 = this, --j3);
        for (; j3 < k3; j3++)
          if ((a2 = arguments[j3]) != null)
            for (c2 in a2) {
              d2 = i3[c2], f3 = a2[c2];
              if (i3 === f3)
                continue;
              l3 && f3 && (e2.isPlainObject(f3) || (g3 = e2.isArray(f3))) ? (g3 ? (g3 = false, h3 = d2 && e2.isArray(d2) ? d2 : []) : h3 = d2 && e2.isPlainObject(d2) ? d2 : {}, i3[c2] = e2.extend(l3, h3, f3)) : f3 !== b && (i3[c2] = f3);
            }
        return i3;
      }, e2.extend({
        noConflict: function(b2) {
          a.$ === e2 && (a.$ = g2), b2 && a.jQuery === e2 && (a.jQuery = f2);
          return e2;
        },
        isReady: false,
        readyWait: 1,
        holdReady: function(a2) {
          a2 ? e2.readyWait++ : e2.ready(true);
        },
        ready: function(a2) {
          if (a2 === true && !--e2.readyWait || a2 !== true && !e2.isReady) {
            if (!c.body)
              return setTimeout(e2.ready, 1);
            e2.isReady = true;
            if (a2 !== true && --e2.readyWait > 0)
              return;
            B.fireWith(c, [e2]), e2.fn.trigger && e2(c).trigger("ready").unbind("ready");
          }
        },
        bindReady: function() {
          if (!B) {
            B = e2.Callbacks("once memory");
            if (c.readyState === "complete")
              return setTimeout(e2.ready, 1);
            if (c.addEventListener)
              c.addEventListener("DOMContentLoaded", C, false), a.addEventListener("load", e2.ready, false);
            else if (c.attachEvent) {
              c.attachEvent("onreadystatechange", C), a.attachEvent("onload", e2.ready);
              var b2 = false;
              try {
                b2 = a.frameElement == null;
              } catch (d2) {
              }
              c.documentElement.doScroll && b2 && K2();
            }
          }
        },
        isFunction: function(a2) {
          return e2.type(a2) === "function";
        },
        isArray: Array.isArray || function(a2) {
          return e2.type(a2) === "array";
        },
        isWindow: function(a2) {
          return a2 && typeof a2 == "object" && "setInterval" in a2;
        },
        isNumeric: function(a2) {
          return a2 != null && m2.test(a2) && !isNaN(a2);
        },
        type: function(a2) {
          return a2 == null ? String(a2) : J2[D.call(a2)] || "object";
        },
        isPlainObject: function(a2) {
          if (!a2 || e2.type(a2) !== "object" || a2.nodeType || e2.isWindow(a2))
            return false;
          try {
            if (a2.constructor && !E2.call(a2, "constructor") && !E2.call(a2.constructor.prototype, "isPrototypeOf"))
              return false;
          } catch (c2) {
            return false;
          }
          var d2;
          for (d2 in a2)
            ;
          return d2 === b || E2.call(a2, d2);
        },
        isEmptyObject: function(a2) {
          for (var b2 in a2)
            return false;
          return true;
        },
        error: function(a2) {
          throw a2;
        },
        parseJSON: function(b2) {
          if (typeof b2 != "string" || !b2)
            return null;
          b2 = e2.trim(b2);
          if (a.JSON && a.JSON.parse)
            return a.JSON.parse(b2);
          if (o2.test(b2.replace(p2, "@").replace(q2, "]").replace(r2, "")))
            return new Function("return " + b2)();
          e2.error("Invalid JSON: " + b2);
        },
        parseXML: function(c2) {
          var d2, f3;
          try {
            a.DOMParser ? (f3 = new DOMParser(), d2 = f3.parseFromString(c2, "text/xml")) : (d2 = new ActiveXObject("Microsoft.XMLDOM"), d2.async = "false", d2.loadXML(c2));
          } catch (g3) {
            d2 = b;
          }
          (!d2 || !d2.documentElement || d2.getElementsByTagName("parsererror").length) && e2.error("Invalid XML: " + c2);
          return d2;
        },
        noop: function() {
        },
        globalEval: function(b2) {
          b2 && j2.test(b2) && (a.execScript || function(b3) {
            a.eval.call(a, b3);
          })(b2);
        },
        camelCase: function(a2) {
          return a2.replace(x2, "ms-").replace(w2, y2);
        },
        nodeName: function(a2, b2) {
          return a2.nodeName && a2.nodeName.toUpperCase() === b2.toUpperCase();
        },
        each: function(a2, c2, d2) {
          var f3, g3 = 0, h3 = a2.length, i3 = h3 === b || e2.isFunction(a2);
          if (d2) {
            if (i3) {
              for (f3 in a2)
                if (c2.apply(a2[f3], d2) === false)
                  break;
            } else
              for (; g3 < h3; )
                if (c2.apply(a2[g3++], d2) === false)
                  break;
          } else if (i3) {
            for (f3 in a2)
              if (c2.call(a2[f3], f3, a2[f3]) === false)
                break;
          } else
            for (; g3 < h3; )
              if (c2.call(a2[g3], g3, a2[g3++]) === false)
                break;
          return a2;
        },
        trim: H2 ? function(a2) {
          return a2 == null ? "" : H2.call(a2);
        } : function(a2) {
          return a2 == null ? "" : (a2 + "").replace(k2, "").replace(l2, "");
        },
        makeArray: function(a2, b2) {
          var c2 = b2 || [];
          if (a2 != null) {
            var d2 = e2.type(a2);
            a2.length == null || d2 === "string" || d2 === "function" || d2 === "regexp" || e2.isWindow(a2) ? F2.call(c2, a2) : e2.merge(c2, a2);
          }
          return c2;
        },
        inArray: function(a2, b2, c2) {
          var d2;
          if (b2) {
            if (I2)
              return I2.call(b2, a2, c2);
            d2 = b2.length, c2 = c2 ? c2 < 0 ? Math.max(0, d2 + c2) : c2 : 0;
            for (; c2 < d2; c2++)
              if (c2 in b2 && b2[c2] === a2)
                return c2;
          }
          return -1;
        },
        merge: function(a2, c2) {
          var d2 = a2.length, e3 = 0;
          if (typeof c2.length == "number")
            for (var f3 = c2.length; e3 < f3; e3++)
              a2[d2++] = c2[e3];
          else
            while (c2[e3] !== b)
              a2[d2++] = c2[e3++];
          a2.length = d2;
          return a2;
        },
        grep: function(a2, b2, c2) {
          var d2 = [], e3;
          c2 = !!c2;
          for (var f3 = 0, g3 = a2.length; f3 < g3; f3++)
            e3 = !!b2(a2[f3], f3), c2 !== e3 && d2.push(a2[f3]);
          return d2;
        },
        map: function(a2, c2, d2) {
          var f3, g3, h3 = [], i3 = 0, j3 = a2.length, k3 = a2 instanceof e2 || j3 !== b && typeof j3 == "number" && (j3 > 0 && a2[0] && a2[j3 - 1] || j3 === 0 || e2.isArray(a2));
          if (k3)
            for (; i3 < j3; i3++)
              f3 = c2(a2[i3], i3, d2), f3 != null && (h3[h3.length] = f3);
          else
            for (g3 in a2)
              f3 = c2(a2[g3], g3, d2), f3 != null && (h3[h3.length] = f3);
          return h3.concat.apply([], h3);
        },
        guid: 1,
        proxy: function(a2, c2) {
          if (typeof c2 == "string") {
            var d2 = a2[c2];
            c2 = a2, a2 = d2;
          }
          if (!e2.isFunction(a2))
            return b;
          var f3 = G2.call(arguments, 2), g3 = function() {
            return a2.apply(c2, f3.concat(G2.call(arguments)));
          };
          g3.guid = a2.guid = a2.guid || g3.guid || e2.guid++;
          return g3;
        },
        access: function(a2, c2, d2, f3, g3, h3) {
          var i3 = a2.length;
          if (typeof c2 == "object") {
            for (var j3 in c2)
              e2.access(a2, j3, c2[j3], f3, g3, d2);
            return a2;
          }
          if (d2 !== b) {
            f3 = !h3 && f3 && e2.isFunction(d2);
            for (var k3 = 0; k3 < i3; k3++)
              g3(a2[k3], c2, f3 ? d2.call(a2[k3], k3, g3(a2[k3], c2)) : d2, h3);
            return a2;
          }
          return i3 ? g3(a2[0], c2) : b;
        },
        now: function() {
          return new Date().getTime();
        },
        uaMatch: function(a2) {
          a2 = a2.toLowerCase();
          var b2 = s2.exec(a2) || t2.exec(a2) || u2.exec(a2) || a2.indexOf("compatible") < 0 && v2.exec(a2) || [];
          return { browser: b2[1] || "", version: b2[2] || "0" };
        },
        sub: function() {
          function a2(b3, c2) {
            return new a2.fn.init(b3, c2);
          }
          e2.extend(true, a2, this), a2.superclass = this, a2.fn = a2.prototype = this(), a2.fn.constructor = a2, a2.sub = this.sub, a2.fn.init = function(d2, f3) {
            f3 && f3 instanceof e2 && !(f3 instanceof a2) && (f3 = a2(f3));
            return e2.fn.init.call(this, d2, f3, b2);
          }, a2.fn.init.prototype = a2.fn;
          var b2 = a2(c);
          return a2;
        },
        browser: {}
      }), e2.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(a2, b2) {
        J2["[object " + b2 + "]"] = b2.toLowerCase();
      }), A2 = e2.uaMatch(z), A2.browser && (e2.browser[A2.browser] = true, e2.browser.version = A2.version), e2.browser.webkit && (e2.browser.safari = true), j2.test("\xA0") && (k2 = /^[\s\xA0]+/, l2 = /[\s\xA0]+$/), h2 = e2(c), c.addEventListener ? C = function() {
        c.removeEventListener("DOMContentLoaded", C, false), e2.ready();
      } : c.attachEvent && (C = function() {
        c.readyState === "complete" && (c.detachEvent("onreadystatechange", C), e2.ready());
      }), typeof define == "function" && define.amd && define.amd.jQuery && define("jquery", [], function() {
        return e2;
      });
      return e2;
    }(), g = {};
    f.Callbacks = function(a2) {
      a2 = a2 ? g[a2] || h(a2) : {};
      var c2 = [], d2 = [], e2, i2, j2, k2, l2, m2 = function(b2) {
        var d3, e3, g2, h2;
        for (d3 = 0, e3 = b2.length; d3 < e3; d3++)
          g2 = b2[d3], h2 = f.type(g2), h2 === "array" ? m2(g2) : h2 === "function" && (!a2.unique || !o2.has(g2)) && c2.push(g2);
      }, n2 = function(b2, f2) {
        f2 = f2 || [], e2 = !a2.memory || [b2, f2], i2 = true, l2 = j2 || 0, j2 = 0, k2 = c2.length;
        for (; c2 && l2 < k2; l2++)
          if (c2[l2].apply(b2, f2) === false && a2.stopOnFalse) {
            e2 = true;
            break;
          }
        i2 = false, c2 && (a2.once ? e2 === true ? o2.disable() : c2 = [] : d2 && d2.length && (e2 = d2.shift(), o2.fireWith(e2[0], e2[1])));
      }, o2 = {
        add: function() {
          if (c2) {
            var a3 = c2.length;
            m2(arguments), i2 ? k2 = c2.length : e2 && e2 !== true && (j2 = a3, n2(e2[0], e2[1]));
          }
          return this;
        },
        remove: function() {
          if (c2) {
            var b2 = arguments, d3 = 0, e3 = b2.length;
            for (; d3 < e3; d3++)
              for (var f2 = 0; f2 < c2.length; f2++)
                if (b2[d3] === c2[f2]) {
                  i2 && f2 <= k2 && (k2--, f2 <= l2 && l2--), c2.splice(f2--, 1);
                  if (a2.unique)
                    break;
                }
          }
          return this;
        },
        has: function(a3) {
          if (c2) {
            var b2 = 0, d3 = c2.length;
            for (; b2 < d3; b2++)
              if (a3 === c2[b2])
                return true;
          }
          return false;
        },
        empty: function() {
          c2 = [];
          return this;
        },
        disable: function() {
          c2 = d2 = e2 = b;
          return this;
        },
        disabled: function() {
          return !c2;
        },
        lock: function() {
          d2 = b, (!e2 || e2 === true) && o2.disable();
          return this;
        },
        locked: function() {
          return !d2;
        },
        fireWith: function(b2, c3) {
          d2 && (i2 ? a2.once || d2.push([b2, c3]) : (!a2.once || !e2) && n2(b2, c3));
          return this;
        },
        fire: function() {
          o2.fireWith(this, arguments);
          return this;
        },
        fired: function() {
          return !!e2;
        }
      };
      return o2;
    };
    var i = [].slice;
    f.extend({
      Deferred: function(a2) {
        var b2 = f.Callbacks("once memory"), c2 = f.Callbacks("once memory"), d2 = f.Callbacks("memory"), e2 = "pending", g2 = { resolve: b2, reject: c2, notify: d2 }, h2 = {
          done: b2.add,
          fail: c2.add,
          progress: d2.add,
          state: function() {
            return e2;
          },
          isResolved: b2.fired,
          isRejected: c2.fired,
          then: function(a3, b3, c3) {
            i2.done(a3).fail(b3).progress(c3);
            return this;
          },
          always: function() {
            return i2.done.apply(i2, arguments).fail.apply(i2, arguments);
          },
          pipe: function(a3, b3, c3) {
            return f.Deferred(function(d3) {
              f.each({ done: [a3, "resolve"], fail: [b3, "reject"], progress: [c3, "notify"] }, function(a4, b4) {
                var c4 = b4[0], e3 = b4[1], g3;
                f.isFunction(c4) ? i2[a4](function() {
                  g3 = c4.apply(this, arguments), g3 && f.isFunction(g3.promise) ? g3.promise().then(d3.resolve, d3.reject, d3.notify) : d3[e3 + "With"](this === i2 ? d3 : this, [g3]);
                }) : i2[a4](d3[e3]);
              });
            }).promise();
          },
          promise: function(a3) {
            if (a3 == null)
              a3 = h2;
            else
              for (var b3 in h2)
                a3[b3] = h2[b3];
            return a3;
          }
        }, i2 = h2.promise({}), j2;
        for (j2 in g2)
          i2[j2] = g2[j2].fire, i2[j2 + "With"] = g2[j2].fireWith;
        i2.done(
          function() {
            e2 = "resolved";
          },
          c2.disable,
          d2.lock
        ).fail(
          function() {
            e2 = "rejected";
          },
          b2.disable,
          d2.lock
        ), a2 && a2.call(i2, i2);
        return i2;
      },
      when: function(a2) {
        function m2(a3) {
          return function(b3) {
            e2[a3] = arguments.length > 1 ? i.call(arguments, 0) : b3, j2.notifyWith(k2, e2);
          };
        }
        function l2(a3) {
          return function(c3) {
            b2[a3] = arguments.length > 1 ? i.call(arguments, 0) : c3, --g2 || j2.resolveWith(j2, b2);
          };
        }
        var b2 = i.call(arguments, 0), c2 = 0, d2 = b2.length, e2 = Array(d2), g2 = d2, j2 = d2 <= 1 && a2 && f.isFunction(a2.promise) ? a2 : f.Deferred(), k2 = j2.promise();
        if (d2 > 1) {
          for (; c2 < d2; c2++)
            b2[c2] && b2[c2].promise && f.isFunction(b2[c2].promise) ? b2[c2].promise().then(l2(c2), j2.reject, m2(c2)) : --g2;
          g2 || j2.resolveWith(j2, b2);
        } else
          j2 !== a2 && j2.resolveWith(j2, d2 ? [a2] : []);
        return k2;
      }
    }), f.support = function() {
      var a2 = c.createElement("div"), b2 = c.documentElement, d2, e2, g2, h2, i2, j2, k2, l2, m2, n2, o2, p2, q2, s2, t2, u2;
      a2.setAttribute("className", "t"), a2.innerHTML = "   <link/><table></table><a href='/a' style='top:1px;float:left;opacity:.55;'>a</a><input type='checkbox'/><nav></nav>", d2 = a2.getElementsByTagName("*"), e2 = a2.getElementsByTagName("a")[0];
      if (!d2 || !d2.length || !e2)
        return {};
      g2 = c.createElement("select"), h2 = g2.appendChild(c.createElement("option")), i2 = a2.getElementsByTagName("input")[0], k2 = {
        leadingWhitespace: a2.firstChild.nodeType === 3,
        tbody: !a2.getElementsByTagName("tbody").length,
        htmlSerialize: !!a2.getElementsByTagName("link").length,
        style: /top/.test(e2.getAttribute("style")),
        hrefNormalized: e2.getAttribute("href") === "/a",
        opacity: /^0.55/.test(e2.style.opacity),
        cssFloat: !!e2.style.cssFloat,
        unknownElems: !!a2.getElementsByTagName("nav").length,
        checkOn: i2.value === "on",
        optSelected: h2.selected,
        getSetAttribute: a2.className !== "t",
        enctype: !!c.createElement("form").enctype,
        submitBubbles: true,
        changeBubbles: true,
        focusinBubbles: false,
        deleteExpando: true,
        noCloneEvent: true,
        inlineBlockNeedsLayout: false,
        shrinkWrapBlocks: false,
        reliableMarginRight: true
      }, i2.checked = true, k2.noCloneChecked = i2.cloneNode(true).checked, g2.disabled = true, k2.optDisabled = !h2.disabled;
      try {
        delete a2.test;
      } catch (v2) {
        k2.deleteExpando = false;
      }
      !a2.addEventListener && a2.attachEvent && a2.fireEvent && (a2.attachEvent("onclick", function() {
        k2.noCloneEvent = false;
      }), a2.cloneNode(true).fireEvent("onclick")), i2 = c.createElement("input"), i2.value = "t", i2.setAttribute("type", "radio"), k2.radioValue = i2.value === "t", i2.setAttribute("checked", "checked"), a2.appendChild(i2), l2 = c.createDocumentFragment(), l2.appendChild(a2.lastChild), k2.checkClone = l2.cloneNode(true).cloneNode(true).lastChild.checked, a2.innerHTML = "", a2.style.width = a2.style.paddingLeft = "1px", m2 = c.getElementsByTagName("body")[0], o2 = c.createElement(m2 ? "div" : "body"), p2 = { visibility: "hidden", width: 0, height: 0, border: 0, margin: 0, background: "none" }, m2 && f.extend(p2, { position: "absolute", left: "-999px", top: "-999px" });
      for (t2 in p2)
        o2.style[t2] = p2[t2];
      o2.appendChild(a2), n2 = m2 || b2, n2.insertBefore(o2, n2.firstChild), k2.appendChecked = i2.checked, k2.boxModel = a2.offsetWidth === 2, "zoom" in a2.style && (a2.style.display = "inline", a2.style.zoom = 1, k2.inlineBlockNeedsLayout = a2.offsetWidth === 2, a2.style.display = "", a2.innerHTML = "<div style='width:4px;'></div>", k2.shrinkWrapBlocks = a2.offsetWidth !== 2), a2.innerHTML = "<table><tr><td style='padding:0;border:0;display:none'></td><td>t</td></tr></table>", q2 = a2.getElementsByTagName("td"), u2 = q2[0].offsetHeight === 0, q2[0].style.display = "", q2[1].style.display = "none", k2.reliableHiddenOffsets = u2 && q2[0].offsetHeight === 0, a2.innerHTML = "", c.defaultView && c.defaultView.getComputedStyle && (j2 = c.createElement("div"), j2.style.width = "0", j2.style.marginRight = "0", a2.appendChild(j2), k2.reliableMarginRight = (parseInt((c.defaultView.getComputedStyle(j2, null) || { marginRight: 0 }).marginRight, 10) || 0) === 0);
      if (a2.attachEvent)
        for (t2 in { submit: 1, change: 1, focusin: 1 })
          s2 = "on" + t2, u2 = s2 in a2, u2 || (a2.setAttribute(s2, "return;"), u2 = typeof a2[s2] == "function"), k2[t2 + "Bubbles"] = u2;
      f(function() {
        var a3, b3, d3, g3, h3, i3 = 1, j3 = "position:absolute;top:0;left:0;width:1px;height:1px;margin:0;", l3 = "visibility:hidden;border:0;", n3 = "style='" + j3 + "border:5px solid #000;padding:0;'", p3 = "<div " + n3 + "><div></div></div><table " + n3 + " cellpadding='0' cellspacing='0'><tr><td></td></tr></table>";
        m2 = c.getElementsByTagName("body")[0];
        !m2 || (a3 = c.createElement("div"), a3.style.cssText = l3 + "width:0;height:0;position:static;top:0;margin-top:" + i3 + "px", m2.insertBefore(a3, m2.firstChild), o2 = c.createElement("div"), o2.style.cssText = j3 + l3, o2.innerHTML = p3, a3.appendChild(o2), b3 = o2.firstChild, d3 = b3.firstChild, g3 = b3.nextSibling.firstChild.firstChild, h3 = { doesNotAddBorder: d3.offsetTop !== 5, doesAddBorderForTableAndCells: g3.offsetTop === 5 }, d3.style.position = "fixed", d3.style.top = "20px", h3.fixedPosition = d3.offsetTop === 20 || d3.offsetTop === 15, d3.style.position = d3.style.top = "", b3.style.overflow = "hidden", b3.style.position = "relative", h3.subtractsBorderForOverflowNotVisible = d3.offsetTop === -5, h3.doesNotIncludeMarginInBodyOffset = m2.offsetTop !== i3, m2.removeChild(a3), o2 = a3 = null, f.extend(k2, h3));
      }), o2.innerHTML = "", n2.removeChild(o2), o2 = l2 = g2 = h2 = m2 = j2 = a2 = i2 = null;
      return k2;
    }(), f.boxModel = f.support.boxModel;
    var j = /^(?:\{.*\}|\[.*\])$/, k = /([A-Z])/g;
    f.extend({
      cache: {},
      uuid: 0,
      expando: "jQuery" + (f.fn.jquery + Math.random()).replace(/\D/g, ""),
      noData: { embed: true, object: "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000", applet: true },
      hasData: function(a2) {
        a2 = a2.nodeType ? f.cache[a2[f.expando]] : a2[f.expando];
        return !!a2 && !m(a2);
      },
      data: function(a2, c2, d2, e2) {
        if (!!f.acceptData(a2)) {
          var g2, h2, i2;
          f.expando;
          var k2 = typeof c2 == "string", l2 = a2.nodeType, m2 = l2 ? f.cache : a2, n2 = l2 ? a2[f.expando] : a2[f.expando] && f.expando, o2 = c2 === "events";
          if ((!n2 || !m2[n2] || !o2 && !e2 && !m2[n2].data) && k2 && d2 === b)
            return;
          n2 || (l2 ? a2[f.expando] = n2 = ++f.uuid : n2 = f.expando), m2[n2] || (m2[n2] = {}, l2 || (m2[n2].toJSON = f.noop));
          if (typeof c2 == "object" || typeof c2 == "function")
            e2 ? m2[n2] = f.extend(m2[n2], c2) : m2[n2].data = f.extend(m2[n2].data, c2);
          g2 = h2 = m2[n2], e2 || (h2.data || (h2.data = {}), h2 = h2.data), d2 !== b && (h2[f.camelCase(c2)] = d2);
          if (o2 && !h2[c2])
            return g2.events;
          k2 ? (i2 = h2[c2], i2 == null && (i2 = h2[f.camelCase(c2)])) : i2 = h2;
          return i2;
        }
      },
      removeData: function(a2, b2, c2) {
        if (!!f.acceptData(a2)) {
          var d2, e2, g2;
          f.expando;
          var i2 = a2.nodeType, j2 = i2 ? f.cache : a2, k2 = i2 ? a2[f.expando] : f.expando;
          if (!j2[k2])
            return;
          if (b2) {
            d2 = c2 ? j2[k2] : j2[k2].data;
            if (d2) {
              f.isArray(b2) ? b2 = b2 : b2 in d2 ? b2 = [b2] : (b2 = f.camelCase(b2), b2 in d2 ? b2 = [b2] : b2 = b2.split(" "));
              for (e2 = 0, g2 = b2.length; e2 < g2; e2++)
                delete d2[b2[e2]];
              if (!(c2 ? m : f.isEmptyObject)(d2))
                return;
            }
          }
          if (!c2) {
            delete j2[k2].data;
            if (!m(j2[k2]))
              return;
          }
          f.support.deleteExpando || !j2.setInterval ? delete j2[k2] : j2[k2] = null, i2 && (f.support.deleteExpando ? delete a2[f.expando] : a2.removeAttribute ? a2.removeAttribute(f.expando) : a2[f.expando] = null);
        }
      },
      _data: function(a2, b2, c2) {
        return f.data(a2, b2, c2, true);
      },
      acceptData: function(a2) {
        if (a2.nodeName) {
          var b2 = f.noData[a2.nodeName.toLowerCase()];
          if (b2)
            return b2 !== true && a2.getAttribute("classid") === b2;
        }
        return true;
      }
    }), f.fn.extend({
      data: function(a2, c2) {
        var d2, e2, g2, h2 = null;
        if (typeof a2 == "undefined") {
          if (this.length) {
            h2 = f.data(this[0]);
            if (this[0].nodeType === 1 && !f._data(this[0], "parsedAttrs")) {
              e2 = this[0].attributes;
              for (var i2 = 0, j2 = e2.length; i2 < j2; i2++)
                g2 = e2[i2].name, g2.indexOf("data-") === 0 && (g2 = f.camelCase(g2.substring(5)), l(this[0], g2, h2[g2]));
              f._data(this[0], "parsedAttrs", true);
            }
          }
          return h2;
        }
        if (typeof a2 == "object")
          return this.each(function() {
            f.data(this, a2);
          });
        d2 = a2.split("."), d2[1] = d2[1] ? "." + d2[1] : "";
        if (c2 === b) {
          h2 = this.triggerHandler("getData" + d2[1] + "!", [d2[0]]), h2 === b && this.length && (h2 = f.data(this[0], a2), h2 = l(this[0], a2, h2));
          return h2 === b && d2[1] ? this.data(d2[0]) : h2;
        }
        return this.each(function() {
          var b2 = f(this), e3 = [d2[0], c2];
          b2.triggerHandler("setData" + d2[1] + "!", e3), f.data(this, a2, c2), b2.triggerHandler("changeData" + d2[1] + "!", e3);
        });
      },
      removeData: function(a2) {
        return this.each(function() {
          f.removeData(this, a2);
        });
      }
    }), f.extend({
      _mark: function(a2, b2) {
        a2 && (b2 = (b2 || "fx") + "mark", f._data(a2, b2, (f._data(a2, b2) || 0) + 1));
      },
      _unmark: function(a2, b2, c2) {
        a2 !== true && (c2 = b2, b2 = a2, a2 = false);
        if (b2) {
          c2 = c2 || "fx";
          var d2 = c2 + "mark", e2 = a2 ? 0 : (f._data(b2, d2) || 1) - 1;
          e2 ? f._data(b2, d2, e2) : (f.removeData(b2, d2, true), n(b2, c2, "mark"));
        }
      },
      queue: function(a2, b2, c2) {
        var d2;
        if (a2) {
          b2 = (b2 || "fx") + "queue", d2 = f._data(a2, b2), c2 && (!d2 || f.isArray(c2) ? d2 = f._data(a2, b2, f.makeArray(c2)) : d2.push(c2));
          return d2 || [];
        }
      },
      dequeue: function(a2, b2) {
        b2 = b2 || "fx";
        var c2 = f.queue(a2, b2), d2 = c2.shift(), e2 = {};
        d2 === "inprogress" && (d2 = c2.shift()), d2 && (b2 === "fx" && c2.unshift("inprogress"), f._data(a2, b2 + ".run", e2), d2.call(
          a2,
          function() {
            f.dequeue(a2, b2);
          },
          e2
        )), c2.length || (f.removeData(a2, b2 + "queue " + b2 + ".run", true), n(a2, b2, "queue"));
      }
    }), f.fn.extend({
      queue: function(a2, c2) {
        typeof a2 != "string" && (c2 = a2, a2 = "fx");
        if (c2 === b)
          return f.queue(this[0], a2);
        return this.each(function() {
          var b2 = f.queue(this, a2, c2);
          a2 === "fx" && b2[0] !== "inprogress" && f.dequeue(this, a2);
        });
      },
      dequeue: function(a2) {
        return this.each(function() {
          f.dequeue(this, a2);
        });
      },
      delay: function(a2, b2) {
        a2 = f.fx ? f.fx.speeds[a2] || a2 : a2, b2 = b2 || "fx";
        return this.queue(b2, function(b3, c2) {
          var d2 = setTimeout(b3, a2);
          c2.stop = function() {
            clearTimeout(d2);
          };
        });
      },
      clearQueue: function(a2) {
        return this.queue(a2 || "fx", []);
      },
      promise: function(a2, c2) {
        function m2() {
          --h2 || d2.resolveWith(e2, [e2]);
        }
        typeof a2 != "string" && (a2 = b), a2 = a2 || "fx";
        var d2 = f.Deferred(), e2 = this, g2 = e2.length, h2 = 1, i2 = a2 + "defer", j2 = a2 + "queue", k2 = a2 + "mark", l2;
        while (g2--)
          if (l2 = f.data(e2[g2], i2, b, true) || (f.data(e2[g2], j2, b, true) || f.data(e2[g2], k2, b, true)) && f.data(e2[g2], i2, f.Callbacks("once memory"), true))
            h2++, l2.add(m2);
        m2();
        return d2.promise();
      }
    });
    var o = /[\n\t\r]/g, p = /\s+/, q = /\r/g, r = /^(?:button|input)$/i, s = /^(?:button|input|object|select|textarea)$/i, t = /^a(?:rea)?$/i, u = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i, v = f.support.getSetAttribute, w, x, y;
    f.fn.extend({
      attr: function(a2, b2) {
        return f.access(this, a2, b2, true, f.attr);
      },
      removeAttr: function(a2) {
        return this.each(function() {
          f.removeAttr(this, a2);
        });
      },
      prop: function(a2, b2) {
        return f.access(this, a2, b2, true, f.prop);
      },
      removeProp: function(a2) {
        a2 = f.propFix[a2] || a2;
        return this.each(function() {
          try {
            this[a2] = b, delete this[a2];
          } catch (c2) {
          }
        });
      },
      addClass: function(a2) {
        var b2, c2, d2, e2, g2, h2, i2;
        if (f.isFunction(a2))
          return this.each(function(b3) {
            f(this).addClass(a2.call(this, b3, this.className));
          });
        if (a2 && typeof a2 == "string") {
          b2 = a2.split(p);
          for (c2 = 0, d2 = this.length; c2 < d2; c2++) {
            e2 = this[c2];
            if (e2.nodeType === 1)
              if (!e2.className && b2.length === 1)
                e2.className = a2;
              else {
                g2 = " " + e2.className + " ";
                for (h2 = 0, i2 = b2.length; h2 < i2; h2++)
                  ~g2.indexOf(" " + b2[h2] + " ") || (g2 += b2[h2] + " ");
                e2.className = f.trim(g2);
              }
          }
        }
        return this;
      },
      removeClass: function(a2) {
        var c2, d2, e2, g2, h2, i2, j2;
        if (f.isFunction(a2))
          return this.each(function(b2) {
            f(this).removeClass(a2.call(this, b2, this.className));
          });
        if (a2 && typeof a2 == "string" || a2 === b) {
          c2 = (a2 || "").split(p);
          for (d2 = 0, e2 = this.length; d2 < e2; d2++) {
            g2 = this[d2];
            if (g2.nodeType === 1 && g2.className)
              if (a2) {
                h2 = (" " + g2.className + " ").replace(o, " ");
                for (i2 = 0, j2 = c2.length; i2 < j2; i2++)
                  h2 = h2.replace(" " + c2[i2] + " ", " ");
                g2.className = f.trim(h2);
              } else
                g2.className = "";
          }
        }
        return this;
      },
      toggleClass: function(a2, b2) {
        var c2 = typeof a2, d2 = typeof b2 == "boolean";
        if (f.isFunction(a2))
          return this.each(function(c3) {
            f(this).toggleClass(a2.call(this, c3, this.className, b2), b2);
          });
        return this.each(function() {
          if (c2 === "string") {
            var e2, g2 = 0, h2 = f(this), i2 = b2, j2 = a2.split(p);
            while (e2 = j2[g2++])
              i2 = d2 ? i2 : !h2.hasClass(e2), h2[i2 ? "addClass" : "removeClass"](e2);
          } else if (c2 === "undefined" || c2 === "boolean")
            this.className && f._data(this, "__className__", this.className), this.className = this.className || a2 === false ? "" : f._data(this, "__className__") || "";
        });
      },
      hasClass: function(a2) {
        var b2 = " " + a2 + " ", c2 = 0, d2 = this.length;
        for (; c2 < d2; c2++)
          if (this[c2].nodeType === 1 && (" " + this[c2].className + " ").replace(o, " ").indexOf(b2) > -1)
            return true;
        return false;
      },
      val: function(a2) {
        var c2, d2, e2, g2 = this[0];
        if (!arguments.length) {
          if (g2) {
            c2 = f.valHooks[g2.nodeName.toLowerCase()] || f.valHooks[g2.type];
            if (c2 && "get" in c2 && (d2 = c2.get(g2, "value")) !== b)
              return d2;
            d2 = g2.value;
            return typeof d2 == "string" ? d2.replace(q, "") : d2 == null ? "" : d2;
          }
          return b;
        }
        e2 = f.isFunction(a2);
        return this.each(function(d3) {
          var g3 = f(this), h2;
          if (this.nodeType === 1) {
            e2 ? h2 = a2.call(this, d3, g3.val()) : h2 = a2, h2 == null ? h2 = "" : typeof h2 == "number" ? h2 += "" : f.isArray(h2) && (h2 = f.map(h2, function(a3) {
              return a3 == null ? "" : a3 + "";
            })), c2 = f.valHooks[this.nodeName.toLowerCase()] || f.valHooks[this.type];
            if (!c2 || !("set" in c2) || c2.set(this, h2, "value") === b)
              this.value = h2;
          }
        });
      }
    }), f.extend({
      valHooks: {
        option: {
          get: function(a2) {
            var b2 = a2.attributes.value;
            return !b2 || b2.specified ? a2.value : a2.text;
          }
        },
        select: {
          get: function(a2) {
            var b2, c2, d2, e2, g2 = a2.selectedIndex, h2 = [], i2 = a2.options, j2 = a2.type === "select-one";
            if (g2 < 0)
              return null;
            c2 = j2 ? g2 : 0, d2 = j2 ? g2 + 1 : i2.length;
            for (; c2 < d2; c2++) {
              e2 = i2[c2];
              if (e2.selected && (f.support.optDisabled ? !e2.disabled : e2.getAttribute("disabled") === null) && (!e2.parentNode.disabled || !f.nodeName(e2.parentNode, "optgroup"))) {
                b2 = f(e2).val();
                if (j2)
                  return b2;
                h2.push(b2);
              }
            }
            if (j2 && !h2.length && i2.length)
              return f(i2[g2]).val();
            return h2;
          },
          set: function(a2, b2) {
            var c2 = f.makeArray(b2);
            f(a2).find("option").each(function() {
              this.selected = f.inArray(f(this).val(), c2) >= 0;
            }), c2.length || (a2.selectedIndex = -1);
            return c2;
          }
        }
      },
      attrFn: { val: true, css: true, html: true, text: true, data: true, width: true, height: true, offset: true },
      attr: function(a2, c2, d2, e2) {
        var g2, h2, i2, j2 = a2.nodeType;
        if (!a2 || j2 === 3 || j2 === 8 || j2 === 2)
          return b;
        if (e2 && c2 in f.attrFn)
          return f(a2)[c2](d2);
        if (!("getAttribute" in a2))
          return f.prop(a2, c2, d2);
        i2 = j2 !== 1 || !f.isXMLDoc(a2), i2 && (c2 = c2.toLowerCase(), h2 = f.attrHooks[c2] || (u.test(c2) ? x : w));
        if (d2 !== b) {
          if (d2 === null) {
            f.removeAttr(a2, c2);
            return b;
          }
          if (h2 && "set" in h2 && i2 && (g2 = h2.set(a2, d2, c2)) !== b)
            return g2;
          a2.setAttribute(c2, "" + d2);
          return d2;
        }
        if (h2 && "get" in h2 && i2 && (g2 = h2.get(a2, c2)) !== null)
          return g2;
        g2 = a2.getAttribute(c2);
        return g2 === null ? b : g2;
      },
      removeAttr: function(a2, b2) {
        var c2, d2, e2, g2, h2 = 0;
        if (a2.nodeType === 1) {
          d2 = (b2 || "").split(p), g2 = d2.length;
          for (; h2 < g2; h2++)
            e2 = d2[h2].toLowerCase(), c2 = f.propFix[e2] || e2, f.attr(a2, e2, ""), a2.removeAttribute(v ? e2 : c2), u.test(e2) && c2 in a2 && (a2[c2] = false);
        }
      },
      attrHooks: {
        type: {
          set: function(a2, b2) {
            if (r.test(a2.nodeName) && a2.parentNode)
              f.error("type property can't be changed");
            else if (!f.support.radioValue && b2 === "radio" && f.nodeName(a2, "input")) {
              var c2 = a2.value;
              a2.setAttribute("type", b2), c2 && (a2.value = c2);
              return b2;
            }
          }
        },
        value: {
          get: function(a2, b2) {
            if (w && f.nodeName(a2, "button"))
              return w.get(a2, b2);
            return b2 in a2 ? a2.value : null;
          },
          set: function(a2, b2, c2) {
            if (w && f.nodeName(a2, "button"))
              return w.set(a2, b2, c2);
            a2.value = b2;
          }
        }
      },
      propFix: {
        tabindex: "tabIndex",
        readonly: "readOnly",
        for: "htmlFor",
        class: "className",
        maxlength: "maxLength",
        cellspacing: "cellSpacing",
        cellpadding: "cellPadding",
        rowspan: "rowSpan",
        colspan: "colSpan",
        usemap: "useMap",
        frameborder: "frameBorder",
        contenteditable: "contentEditable"
      },
      prop: function(a2, c2, d2) {
        var e2, g2, h2, i2 = a2.nodeType;
        if (!a2 || i2 === 3 || i2 === 8 || i2 === 2)
          return b;
        h2 = i2 !== 1 || !f.isXMLDoc(a2), h2 && (c2 = f.propFix[c2] || c2, g2 = f.propHooks[c2]);
        return d2 !== b ? g2 && "set" in g2 && (e2 = g2.set(a2, d2, c2)) !== b ? e2 : a2[c2] = d2 : g2 && "get" in g2 && (e2 = g2.get(a2, c2)) !== null ? e2 : a2[c2];
      },
      propHooks: {
        tabIndex: {
          get: function(a2) {
            var c2 = a2.getAttributeNode("tabindex");
            return c2 && c2.specified ? parseInt(c2.value, 10) : s.test(a2.nodeName) || t.test(a2.nodeName) && a2.href ? 0 : b;
          }
        }
      }
    }), f.attrHooks.tabindex = f.propHooks.tabIndex, x = {
      get: function(a2, c2) {
        var d2, e2 = f.prop(a2, c2);
        return e2 === true || typeof e2 != "boolean" && (d2 = a2.getAttributeNode(c2)) && d2.nodeValue !== false ? c2.toLowerCase() : b;
      },
      set: function(a2, b2, c2) {
        var d2;
        b2 === false ? f.removeAttr(a2, c2) : (d2 = f.propFix[c2] || c2, d2 in a2 && (a2[d2] = true), a2.setAttribute(c2, c2.toLowerCase()));
        return c2;
      }
    }, v || (y = { name: true, id: true }, w = f.valHooks.button = {
      get: function(a2, c2) {
        var d2;
        d2 = a2.getAttributeNode(c2);
        return d2 && (y[c2] ? d2.nodeValue !== "" : d2.specified) ? d2.nodeValue : b;
      },
      set: function(a2, b2, d2) {
        var e2 = a2.getAttributeNode(d2);
        e2 || (e2 = c.createAttribute(d2), a2.setAttributeNode(e2));
        return e2.nodeValue = b2 + "";
      }
    }, f.attrHooks.tabindex.set = w.set, f.each(["width", "height"], function(a2, b2) {
      f.attrHooks[b2] = f.extend(f.attrHooks[b2], {
        set: function(a3, c2) {
          if (c2 === "") {
            a3.setAttribute(b2, "auto");
            return c2;
          }
        }
      });
    }), f.attrHooks.contenteditable = {
      get: w.get,
      set: function(a2, b2, c2) {
        b2 === "" && (b2 = "false"), w.set(a2, b2, c2);
      }
    }), f.support.hrefNormalized || f.each(["href", "src", "width", "height"], function(a2, c2) {
      f.attrHooks[c2] = f.extend(f.attrHooks[c2], {
        get: function(a3) {
          var d2 = a3.getAttribute(c2, 2);
          return d2 === null ? b : d2;
        }
      });
    }), f.support.style || (f.attrHooks.style = {
      get: function(a2) {
        return a2.style.cssText.toLowerCase() || b;
      },
      set: function(a2, b2) {
        return a2.style.cssText = "" + b2;
      }
    }), f.support.optSelected || (f.propHooks.selected = f.extend(f.propHooks.selected, {
      get: function(a2) {
        var b2 = a2.parentNode;
        b2 && (b2.selectedIndex, b2.parentNode && b2.parentNode.selectedIndex);
        return null;
      }
    })), f.support.enctype || (f.propFix.enctype = "encoding"), f.support.checkOn || f.each(["radio", "checkbox"], function() {
      f.valHooks[this] = {
        get: function(a2) {
          return a2.getAttribute("value") === null ? "on" : a2.value;
        }
      };
    }), f.each(["radio", "checkbox"], function() {
      f.valHooks[this] = f.extend(f.valHooks[this], {
        set: function(a2, b2) {
          if (f.isArray(b2))
            return a2.checked = f.inArray(f(a2).val(), b2) >= 0;
        }
      });
    });
    var A = /^(?:textarea|input|select)$/i, E = /^([^\.]*)?(?:\.(.+))?$/, F = /\bhover(\.\S+)?/, G = /^key/, H = /^(?:mouse|contextmenu)|click/, I = /^(\w*)(?:#([\w\-]+))?(?:\.([\w\-]+))?$/, J = function(a2) {
      var b2 = I.exec(a2);
      b2 && (b2[1] = (b2[1] || "").toLowerCase(), b2[3] = b2[3] && new RegExp("(?:^|\\s)" + b2[3] + "(?:\\s|$)"));
      return b2;
    }, K = function(a2, b2) {
      return (!b2[1] || a2.nodeName.toLowerCase() === b2[1]) && (!b2[2] || a2.id === b2[2]) && (!b2[3] || b2[3].test(a2.className));
    }, L = function(a2) {
      return f.event.special.hover ? a2 : a2.replace(F, "mouseenter$1 mouseleave$1");
    };
    f.event = {
      add: function(a2, c2, d2, e2, g2) {
        var h2, i2, j2, k2, l2, m2, n2, o2, p2, r2, s2;
        if (!(a2.nodeType === 3 || a2.nodeType === 8 || !c2 || !d2 || !(h2 = f._data(a2)))) {
          d2.handler && (p2 = d2, d2 = p2.handler), d2.guid || (d2.guid = f.guid++), j2 = h2.events, j2 || (h2.events = j2 = {}), i2 = h2.handle, i2 || (h2.handle = i2 = function(a3) {
            return typeof f != "undefined" && (!a3 || f.event.triggered !== a3.type) ? f.event.dispatch.apply(i2.elem, arguments) : b;
          }, i2.elem = a2), c2 = L(c2).split(" ");
          for (k2 = 0; k2 < c2.length; k2++) {
            l2 = E.exec(c2[k2]) || [], m2 = l2[1], n2 = (l2[2] || "").split(".").sort(), s2 = f.event.special[m2] || {}, m2 = (g2 ? s2.delegateType : s2.bindType) || m2, s2 = f.event.special[m2] || {}, o2 = f.extend(
              { type: m2, origType: l2[1], data: e2, handler: d2, guid: d2.guid, selector: g2, namespace: n2.join(".") },
              p2
            ), g2 && (o2.quick = J(g2), !o2.quick && f.expr.match.POS.test(g2) && (o2.isPositional = true)), r2 = j2[m2];
            if (!r2) {
              r2 = j2[m2] = [], r2.delegateCount = 0;
              if (!s2.setup || s2.setup.call(a2, e2, n2, i2) === false)
                a2.addEventListener ? a2.addEventListener(m2, i2, false) : a2.attachEvent && a2.attachEvent("on" + m2, i2);
            }
            s2.add && (s2.add.call(a2, o2), o2.handler.guid || (o2.handler.guid = d2.guid)), g2 ? r2.splice(r2.delegateCount++, 0, o2) : r2.push(o2), f.event.global[m2] = true;
          }
          a2 = null;
        }
      },
      global: {},
      remove: function(a2, b2, c2, d2) {
        var e2 = f.hasData(a2) && f._data(a2), g2, h2, i2, j2, k2, l2, m2, n2, o2, p2, q2;
        if (!!e2 && !!(m2 = e2.events)) {
          b2 = L(b2 || "").split(" ");
          for (g2 = 0; g2 < b2.length; g2++) {
            h2 = E.exec(b2[g2]) || [], i2 = h2[1], j2 = h2[2];
            if (!i2) {
              j2 = j2 ? "." + j2 : "";
              for (l2 in m2)
                f.event.remove(a2, l2 + j2, c2, d2);
              return;
            }
            n2 = f.event.special[i2] || {}, i2 = (d2 ? n2.delegateType : n2.bindType) || i2, p2 = m2[i2] || [], k2 = p2.length, j2 = j2 ? new RegExp("(^|\\.)" + j2.split(".").sort().join("\\.(?:.*\\.)?") + "(\\.|$)") : null;
            if (c2 || j2 || d2 || n2.remove)
              for (l2 = 0; l2 < p2.length; l2++) {
                q2 = p2[l2];
                if (!c2 || c2.guid === q2.guid) {
                  if (!j2 || j2.test(q2.namespace)) {
                    if (!d2 || d2 === q2.selector || d2 === "**" && q2.selector)
                      p2.splice(l2--, 1), q2.selector && p2.delegateCount--, n2.remove && n2.remove.call(a2, q2);
                  }
                }
              }
            else
              p2.length = 0;
            p2.length === 0 && k2 !== p2.length && ((!n2.teardown || n2.teardown.call(a2, j2) === false) && f.removeEvent(a2, i2, e2.handle), delete m2[i2]);
          }
          f.isEmptyObject(m2) && (o2 = e2.handle, o2 && (o2.elem = null), f.removeData(a2, ["events", "handle"], true));
        }
      },
      customEvent: { getData: true, setData: true, changeData: true },
      trigger: function(c2, d2, e2, g2) {
        if (!e2 || e2.nodeType !== 3 && e2.nodeType !== 8) {
          var h2 = c2.type || c2, i2 = [], j2, k2, l2, m2, n2, o2, p2, q2, r2, s2;
          h2.indexOf("!") >= 0 && (h2 = h2.slice(0, -1), k2 = true), h2.indexOf(".") >= 0 && (i2 = h2.split("."), h2 = i2.shift(), i2.sort());
          if ((!e2 || f.event.customEvent[h2]) && !f.event.global[h2])
            return;
          c2 = typeof c2 == "object" ? c2[f.expando] ? c2 : new f.Event(h2, c2) : new f.Event(h2), c2.type = h2, c2.isTrigger = true, c2.exclusive = k2, c2.namespace = i2.join("."), c2.namespace_re = c2.namespace ? new RegExp("(^|\\.)" + i2.join("\\.(?:.*\\.)?") + "(\\.|$)") : null, o2 = h2.indexOf(":") < 0 ? "on" + h2 : "", (g2 || !e2) && c2.preventDefault();
          if (!e2) {
            j2 = f.cache;
            for (l2 in j2)
              j2[l2].events && j2[l2].events[h2] && f.event.trigger(c2, d2, j2[l2].handle.elem, true);
            return;
          }
          c2.result = b, c2.target || (c2.target = e2), d2 = d2 != null ? f.makeArray(d2) : [], d2.unshift(c2), p2 = f.event.special[h2] || {};
          if (p2.trigger && p2.trigger.apply(e2, d2) === false)
            return;
          r2 = [[e2, p2.bindType || h2]];
          if (!g2 && !p2.noBubble && !f.isWindow(e2)) {
            s2 = p2.delegateType || h2, n2 = null;
            for (m2 = e2.parentNode; m2; m2 = m2.parentNode)
              r2.push([m2, s2]), n2 = m2;
            n2 && n2 === e2.ownerDocument && r2.push([n2.defaultView || n2.parentWindow || a, s2]);
          }
          for (l2 = 0; l2 < r2.length; l2++) {
            m2 = r2[l2][0], c2.type = r2[l2][1], q2 = (f._data(m2, "events") || {})[c2.type] && f._data(m2, "handle"), q2 && q2.apply(m2, d2), q2 = o2 && m2[o2], q2 && f.acceptData(m2) && q2.apply(m2, d2);
            if (c2.isPropagationStopped())
              break;
          }
          c2.type = h2, c2.isDefaultPrevented() || (!p2._default || p2._default.apply(e2.ownerDocument, d2) === false) && (h2 !== "click" || !f.nodeName(e2, "a")) && f.acceptData(e2) && o2 && e2[h2] && (h2 !== "focus" && h2 !== "blur" || c2.target.offsetWidth !== 0) && !f.isWindow(e2) && (n2 = e2[o2], n2 && (e2[o2] = null), f.event.triggered = h2, e2[h2](), f.event.triggered = b, n2 && (e2[o2] = n2));
          return c2.result;
        }
      },
      dispatch: function(c2) {
        c2 = f.event.fix(c2 || a.event);
        var d2 = (f._data(this, "events") || {})[c2.type] || [], e2 = d2.delegateCount, g2 = [].slice.call(arguments, 0), h2 = !c2.exclusive && !c2.namespace, i2 = (f.event.special[c2.type] || {}).handle, j2 = [], k2, l2, m2, n2, o2, p2, q2, r2, s2, t2;
        g2[0] = c2, c2.delegateTarget = this;
        if (e2 && !c2.target.disabled && (!c2.button || c2.type !== "click"))
          for (m2 = c2.target; m2 != this; m2 = m2.parentNode || this) {
            o2 = {}, q2 = [];
            for (k2 = 0; k2 < e2; k2++)
              r2 = d2[k2], s2 = r2.selector, t2 = o2[s2], r2.isPositional ? t2 = (t2 || (o2[s2] = f(s2))).index(m2) >= 0 : t2 === b && (t2 = o2[s2] = r2.quick ? K(m2, r2.quick) : f(m2).is(s2)), t2 && q2.push(r2);
            q2.length && j2.push({ elem: m2, matches: q2 });
          }
        d2.length > e2 && j2.push({ elem: this, matches: d2.slice(e2) });
        for (k2 = 0; k2 < j2.length && !c2.isPropagationStopped(); k2++) {
          p2 = j2[k2], c2.currentTarget = p2.elem;
          for (l2 = 0; l2 < p2.matches.length && !c2.isImmediatePropagationStopped(); l2++) {
            r2 = p2.matches[l2];
            if (h2 || !c2.namespace && !r2.namespace || c2.namespace_re && c2.namespace_re.test(r2.namespace))
              c2.data = r2.data, c2.handleObj = r2, n2 = (i2 || r2.handler).apply(p2.elem, g2), n2 !== b && (c2.result = n2, n2 === false && (c2.preventDefault(), c2.stopPropagation()));
          }
        }
        return c2.result;
      },
      props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(
        " "
      ),
      fixHooks: {},
      keyHooks: {
        props: "char charCode key keyCode".split(" "),
        filter: function(a2, b2) {
          a2.which == null && (a2.which = b2.charCode != null ? b2.charCode : b2.keyCode);
          return a2;
        }
      },
      mouseHooks: {
        props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement wheelDelta".split(
          " "
        ),
        filter: function(a2, d2) {
          var e2, f2, g2, h2 = d2.button, i2 = d2.fromElement;
          a2.pageX == null && d2.clientX != null && (e2 = a2.target.ownerDocument || c, f2 = e2.documentElement, g2 = e2.body, a2.pageX = d2.clientX + (f2 && f2.scrollLeft || g2 && g2.scrollLeft || 0) - (f2 && f2.clientLeft || g2 && g2.clientLeft || 0), a2.pageY = d2.clientY + (f2 && f2.scrollTop || g2 && g2.scrollTop || 0) - (f2 && f2.clientTop || g2 && g2.clientTop || 0)), !a2.relatedTarget && i2 && (a2.relatedTarget = i2 === a2.target ? d2.toElement : i2), !a2.which && h2 !== b && (a2.which = h2 & 1 ? 1 : h2 & 2 ? 3 : h2 & 4 ? 2 : 0);
          return a2;
        }
      },
      fix: function(a2) {
        if (a2[f.expando])
          return a2;
        var d2, e2, g2 = a2, h2 = f.event.fixHooks[a2.type] || {}, i2 = h2.props ? this.props.concat(h2.props) : this.props;
        a2 = f.Event(g2);
        for (d2 = i2.length; d2; )
          e2 = i2[--d2], a2[e2] = g2[e2];
        a2.target || (a2.target = g2.srcElement || c), a2.target.nodeType === 3 && (a2.target = a2.target.parentNode), a2.metaKey === b && (a2.metaKey = a2.ctrlKey);
        return h2.filter ? h2.filter(a2, g2) : a2;
      },
      special: {
        ready: { setup: f.bindReady },
        focus: { delegateType: "focusin", noBubble: true },
        blur: { delegateType: "focusout", noBubble: true },
        beforeunload: {
          setup: function(a2, b2, c2) {
            f.isWindow(this) && (this.onbeforeunload = c2);
          },
          teardown: function(a2, b2) {
            this.onbeforeunload === b2 && (this.onbeforeunload = null);
          }
        }
      },
      simulate: function(a2, b2, c2, d2) {
        var e2 = f.extend(new f.Event(), c2, { type: a2, isSimulated: true, originalEvent: {} });
        d2 ? f.event.trigger(e2, null, b2) : f.event.dispatch.call(b2, e2), e2.isDefaultPrevented() && c2.preventDefault();
      }
    }, f.event.handle = f.event.dispatch, f.removeEvent = c.removeEventListener ? function(a2, b2, c2) {
      a2.removeEventListener && a2.removeEventListener(b2, c2, false);
    } : function(a2, b2, c2) {
      a2.detachEvent && a2.detachEvent("on" + b2, c2);
    }, f.Event = function(a2, b2) {
      if (!(this instanceof f.Event))
        return new f.Event(a2, b2);
      a2 && a2.type ? (this.originalEvent = a2, this.type = a2.type, this.isDefaultPrevented = a2.defaultPrevented || a2.returnValue === false || a2.getPreventDefault && a2.getPreventDefault() ? N : M) : this.type = a2, b2 && f.extend(this, b2), this.timeStamp = a2 && a2.timeStamp || f.now(), this[f.expando] = true;
    }, f.Event.prototype = {
      preventDefault: function() {
        this.isDefaultPrevented = N;
        var a2 = this.originalEvent;
        !a2 || (a2.preventDefault ? a2.preventDefault() : a2.returnValue = false);
      },
      stopPropagation: function() {
        this.isPropagationStopped = N;
        var a2 = this.originalEvent;
        !a2 || (a2.stopPropagation && a2.stopPropagation(), a2.cancelBubble = true);
      },
      stopImmediatePropagation: function() {
        this.isImmediatePropagationStopped = N, this.stopPropagation();
      },
      isDefaultPrevented: M,
      isPropagationStopped: M,
      isImmediatePropagationStopped: M
    }, f.each({ mouseenter: "mouseover", mouseleave: "mouseout" }, function(a2, b2) {
      f.event.special[a2] = f.event.special[b2] = {
        delegateType: b2,
        bindType: b2,
        handle: function(a3) {
          var b3 = this, c2 = a3.relatedTarget, d2 = a3.handleObj;
          d2.selector;
          var g2, h2;
          if (!c2 || d2.origType === a3.type || c2 !== b3 && !f.contains(b3, c2))
            g2 = a3.type, a3.type = d2.origType, h2 = d2.handler.apply(this, arguments), a3.type = g2;
          return h2;
        }
      };
    }), f.support.submitBubbles || (f.event.special.submit = {
      setup: function() {
        if (f.nodeName(this, "form"))
          return false;
        f.event.add(this, "click._submit keypress._submit", function(a2) {
          var c2 = a2.target, d2 = f.nodeName(c2, "input") || f.nodeName(c2, "button") ? c2.form : b;
          d2 && !d2._submit_attached && (f.event.add(d2, "submit._submit", function(a3) {
            this.parentNode && f.event.simulate("submit", this.parentNode, a3, true);
          }), d2._submit_attached = true);
        });
      },
      teardown: function() {
        if (f.nodeName(this, "form"))
          return false;
        f.event.remove(this, "._submit");
      }
    }), f.support.changeBubbles || (f.event.special.change = {
      setup: function() {
        if (A.test(this.nodeName)) {
          if (this.type === "checkbox" || this.type === "radio")
            f.event.add(this, "propertychange._change", function(a2) {
              a2.originalEvent.propertyName === "checked" && (this._just_changed = true);
            }), f.event.add(this, "click._change", function(a2) {
              this._just_changed && (this._just_changed = false, f.event.simulate("change", this, a2, true));
            });
          return false;
        }
        f.event.add(this, "beforeactivate._change", function(a2) {
          var b2 = a2.target;
          A.test(b2.nodeName) && !b2._change_attached && (f.event.add(b2, "change._change", function(a3) {
            this.parentNode && !a3.isSimulated && f.event.simulate("change", this.parentNode, a3, true);
          }), b2._change_attached = true);
        });
      },
      handle: function(a2) {
        var b2 = a2.target;
        if (this !== b2 || a2.isSimulated || a2.isTrigger || b2.type !== "radio" && b2.type !== "checkbox")
          return a2.handleObj.handler.apply(this, arguments);
      },
      teardown: function() {
        f.event.remove(this, "._change");
        return A.test(this.nodeName);
      }
    }), f.support.focusinBubbles || f.each({ focus: "focusin", blur: "focusout" }, function(a2, b2) {
      var d2 = 0, e2 = function(a3) {
        f.event.simulate(b2, a3.target, f.event.fix(a3), true);
      };
      f.event.special[b2] = {
        setup: function() {
          d2++ === 0 && c.addEventListener(a2, e2, true);
        },
        teardown: function() {
          --d2 === 0 && c.removeEventListener(a2, e2, true);
        }
      };
    }), f.fn.extend({
      on: function(a2, c2, d2, e2, g2) {
        var h2, i2;
        if (typeof a2 == "object") {
          typeof c2 != "string" && (d2 = c2, c2 = b);
          for (i2 in a2)
            this.on(i2, c2, d2, a2[i2], g2);
          return this;
        }
        d2 == null && e2 == null ? (e2 = c2, d2 = c2 = b) : e2 == null && (typeof c2 == "string" ? (e2 = d2, d2 = b) : (e2 = d2, d2 = c2, c2 = b));
        if (e2 === false)
          e2 = M;
        else if (!e2)
          return this;
        g2 === 1 && (h2 = e2, e2 = function(a3) {
          f().off(a3);
          return h2.apply(this, arguments);
        }, e2.guid = h2.guid || (h2.guid = f.guid++));
        return this.each(function() {
          f.event.add(this, a2, e2, d2, c2);
        });
      },
      one: function(a2, b2, c2, d2) {
        return this.on.call(this, a2, b2, c2, d2, 1);
      },
      off: function(a2, c2, d2) {
        if (a2 && a2.preventDefault && a2.handleObj) {
          var e2 = a2.handleObj;
          f(a2.delegateTarget).off(e2.namespace ? e2.type + "." + e2.namespace : e2.type, e2.selector, e2.handler);
          return this;
        }
        if (typeof a2 == "object") {
          for (var g2 in a2)
            this.off(g2, c2, a2[g2]);
          return this;
        }
        if (c2 === false || typeof c2 == "function")
          d2 = c2, c2 = b;
        d2 === false && (d2 = M);
        return this.each(function() {
          f.event.remove(this, a2, d2, c2);
        });
      },
      bind: function(a2, b2, c2) {
        return this.on(a2, null, b2, c2);
      },
      unbind: function(a2, b2) {
        return this.off(a2, null, b2);
      },
      live: function(a2, b2, c2) {
        f(this.context).on(a2, this.selector, b2, c2);
        return this;
      },
      die: function(a2, b2) {
        f(this.context).off(a2, this.selector || "**", b2);
        return this;
      },
      delegate: function(a2, b2, c2, d2) {
        return this.on(b2, a2, c2, d2);
      },
      undelegate: function(a2, b2, c2) {
        return arguments.length == 1 ? this.off(a2, "**") : this.off(b2, a2, c2);
      },
      trigger: function(a2, b2) {
        return this.each(function() {
          f.event.trigger(a2, b2, this);
        });
      },
      triggerHandler: function(a2, b2) {
        if (this[0])
          return f.event.trigger(a2, b2, this[0], true);
      },
      toggle: function(a2) {
        var b2 = arguments, c2 = a2.guid || f.guid++, d2 = 0, e2 = function(c3) {
          var e3 = (f._data(this, "lastToggle" + a2.guid) || 0) % d2;
          f._data(this, "lastToggle" + a2.guid, e3 + 1), c3.preventDefault();
          return b2[e3].apply(this, arguments) || false;
        };
        e2.guid = c2;
        while (d2 < b2.length)
          b2[d2++].guid = c2;
        return this.click(e2);
      },
      hover: function(a2, b2) {
        return this.mouseenter(a2).mouseleave(b2 || a2);
      }
    }), f.each(
      "blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(
        " "
      ),
      function(a2, b2) {
        f.fn[b2] = function(a3, c2) {
          c2 == null && (c2 = a3, a3 = null);
          return arguments.length > 0 ? this.bind(b2, a3, c2) : this.trigger(b2);
        }, f.attrFn && (f.attrFn[b2] = true), G.test(b2) && (f.event.fixHooks[b2] = f.event.keyHooks), H.test(b2) && (f.event.fixHooks[b2] = f.event.mouseHooks);
      }
    ), function() {
      function x2(a3, b2, c2, e3, f2, g3) {
        for (var h3 = 0, i3 = e3.length; h3 < i3; h3++) {
          var j3 = e3[h3];
          if (j3) {
            var k3 = false;
            j3 = j3[a3];
            while (j3) {
              if (j3[d2] === c2) {
                k3 = e3[j3.sizset];
                break;
              }
              if (j3.nodeType === 1) {
                g3 || (j3[d2] = c2, j3.sizset = h3);
                if (typeof b2 != "string") {
                  if (j3 === b2) {
                    k3 = true;
                    break;
                  }
                } else if (m2.filter(b2, [j3]).length > 0) {
                  k3 = j3;
                  break;
                }
              }
              j3 = j3[a3];
            }
            e3[h3] = k3;
          }
        }
      }
      function w2(a3, b2, c2, e3, f2, g3) {
        for (var h3 = 0, i3 = e3.length; h3 < i3; h3++) {
          var j3 = e3[h3];
          if (j3) {
            var k3 = false;
            j3 = j3[a3];
            while (j3) {
              if (j3[d2] === c2) {
                k3 = e3[j3.sizset];
                break;
              }
              j3.nodeType === 1 && !g3 && (j3[d2] = c2, j3.sizset = h3);
              if (j3.nodeName.toLowerCase() === b2) {
                k3 = j3;
                break;
              }
              j3 = j3[a3];
            }
            e3[h3] = k3;
          }
        }
      }
      var a2 = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^\[\]]*\]|['"][^'"]*['"]|[^\[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g, d2 = "sizcache" + (Math.random() + "").replace(".", ""), e2 = 0, g2 = Object.prototype.toString, h2 = false, i2 = true, j2 = /\\/g, k2 = /\r\n/g, l2 = /\W/;
      [0, 0].sort(function() {
        i2 = false;
        return 0;
      });
      var m2 = function(b2, d3, e3, f2) {
        e3 = e3 || [], d3 = d3 || c;
        var h3 = d3;
        if (d3.nodeType !== 1 && d3.nodeType !== 9)
          return [];
        if (!b2 || typeof b2 != "string")
          return e3;
        var i3, j3, k3, l3, n3, q3, r3, t2, u3 = true, v3 = m2.isXML(d3), w3 = [], x3 = b2;
        do {
          a2.exec(""), i3 = a2.exec(x3);
          if (i3) {
            x3 = i3[3], w3.push(i3[1]);
            if (i3[2]) {
              l3 = i3[3];
              break;
            }
          }
        } while (i3);
        if (w3.length > 1 && p2.exec(b2))
          if (w3.length === 2 && o2.relative[w3[0]])
            j3 = y2(w3[0] + w3[1], d3, f2);
          else {
            j3 = o2.relative[w3[0]] ? [d3] : m2(w3.shift(), d3);
            while (w3.length)
              b2 = w3.shift(), o2.relative[b2] && (b2 += w3.shift()), j3 = y2(b2, j3, f2);
          }
        else {
          !f2 && w3.length > 1 && d3.nodeType === 9 && !v3 && o2.match.ID.test(w3[0]) && !o2.match.ID.test(w3[w3.length - 1]) && (n3 = m2.find(w3.shift(), d3, v3), d3 = n3.expr ? m2.filter(n3.expr, n3.set)[0] : n3.set[0]);
          if (d3) {
            n3 = f2 ? { expr: w3.pop(), set: s2(f2) } : m2.find(
              w3.pop(),
              w3.length === 1 && (w3[0] === "~" || w3[0] === "+") && d3.parentNode ? d3.parentNode : d3,
              v3
            ), j3 = n3.expr ? m2.filter(n3.expr, n3.set) : n3.set, w3.length > 0 ? k3 = s2(j3) : u3 = false;
            while (w3.length)
              q3 = w3.pop(), r3 = q3, o2.relative[q3] ? r3 = w3.pop() : q3 = "", r3 == null && (r3 = d3), o2.relative[q3](k3, r3, v3);
          } else
            k3 = w3 = [];
        }
        k3 || (k3 = j3), k3 || m2.error(q3 || b2);
        if (g2.call(k3) === "[object Array]")
          if (!u3)
            e3.push.apply(e3, k3);
          else if (d3 && d3.nodeType === 1)
            for (t2 = 0; k3[t2] != null; t2++)
              k3[t2] && (k3[t2] === true || k3[t2].nodeType === 1 && m2.contains(d3, k3[t2])) && e3.push(j3[t2]);
          else
            for (t2 = 0; k3[t2] != null; t2++)
              k3[t2] && k3[t2].nodeType === 1 && e3.push(j3[t2]);
        else
          s2(k3, e3);
        l3 && (m2(l3, h3, e3, f2), m2.uniqueSort(e3));
        return e3;
      };
      m2.uniqueSort = function(a3) {
        if (u2) {
          h2 = i2, a3.sort(u2);
          if (h2)
            for (var b2 = 1; b2 < a3.length; b2++)
              a3[b2] === a3[b2 - 1] && a3.splice(b2--, 1);
        }
        return a3;
      }, m2.matches = function(a3, b2) {
        return m2(a3, null, null, b2);
      }, m2.matchesSelector = function(a3, b2) {
        return m2(b2, null, null, [a3]).length > 0;
      }, m2.find = function(a3, b2, c2) {
        var d3, e3, f2, g3, h3, i3;
        if (!a3)
          return [];
        for (e3 = 0, f2 = o2.order.length; e3 < f2; e3++) {
          h3 = o2.order[e3];
          if (g3 = o2.leftMatch[h3].exec(a3)) {
            i3 = g3[1], g3.splice(1, 1);
            if (i3.substr(i3.length - 1) !== "\\") {
              g3[1] = (g3[1] || "").replace(j2, ""), d3 = o2.find[h3](g3, b2, c2);
              if (d3 != null) {
                a3 = a3.replace(o2.match[h3], "");
                break;
              }
            }
          }
        }
        d3 || (d3 = typeof b2.getElementsByTagName != "undefined" ? b2.getElementsByTagName("*") : []);
        return { set: d3, expr: a3 };
      }, m2.filter = function(a3, c2, d3, e3) {
        var f2, g3, h3, i3, j3, k3, l3, n3, p3, q3 = a3, r3 = [], s3 = c2, t2 = c2 && c2[0] && m2.isXML(c2[0]);
        while (a3 && c2.length) {
          for (h3 in o2.filter)
            if ((f2 = o2.leftMatch[h3].exec(a3)) != null && f2[2]) {
              k3 = o2.filter[h3], l3 = f2[1], g3 = false, f2.splice(1, 1);
              if (l3.substr(l3.length - 1) === "\\")
                continue;
              s3 === r3 && (r3 = []);
              if (o2.preFilter[h3]) {
                f2 = o2.preFilter[h3](f2, s3, d3, r3, e3, t2);
                if (!f2)
                  g3 = i3 = true;
                else if (f2 === true)
                  continue;
              }
              if (f2)
                for (n3 = 0; (j3 = s3[n3]) != null; n3++)
                  j3 && (i3 = k3(j3, f2, n3, s3), p3 = e3 ^ i3, d3 && i3 != null ? p3 ? g3 = true : s3[n3] = false : p3 && (r3.push(j3), g3 = true));
              if (i3 !== b) {
                d3 || (s3 = r3), a3 = a3.replace(o2.match[h3], "");
                if (!g3)
                  return [];
                break;
              }
            }
          if (a3 === q3)
            if (g3 == null)
              m2.error(a3);
            else
              break;
          q3 = a3;
        }
        return s3;
      }, m2.error = function(a3) {
        throw "Syntax error, unrecognized expression: " + a3;
      };
      var n2 = m2.getText = function(a3) {
        var b2, c2, d3 = a3.nodeType, e3 = "";
        if (d3) {
          if (d3 === 1) {
            if (typeof a3.textContent == "string")
              return a3.textContent;
            if (typeof a3.innerText == "string")
              return a3.innerText.replace(k2, "");
            for (a3 = a3.firstChild; a3; a3 = a3.nextSibling)
              e3 += n2(a3);
          } else if (d3 === 3 || d3 === 4)
            return a3.nodeValue;
        } else
          for (b2 = 0; c2 = a3[b2]; b2++)
            c2.nodeType !== 8 && (e3 += n2(c2));
        return e3;
      }, o2 = m2.selectors = {
        order: ["ID", "NAME", "TAG"],
        match: {
          ID: /#((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
          CLASS: /\.((?:[\w\u00c0-\uFFFF\-]|\\.)+)/,
          NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF\-]|\\.)+)['"]*\]/,
          ATTR: /\[\s*((?:[\w\u00c0-\uFFFF\-]|\\.)+)\s*(?:(\S?=)\s*(?:(['"])(.*?)\3|(#?(?:[\w\u00c0-\uFFFF\-]|\\.)*)|)|)\s*\]/,
          TAG: /^((?:[\w\u00c0-\uFFFF\*\-]|\\.)+)/,
          CHILD: /:(only|nth|last|first)-child(?:\(\s*(even|odd|(?:[+\-]?\d+|(?:[+\-]?\d*)?n\s*(?:[+\-]\s*\d+)?))\s*\))?/,
          POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^\-]|$)/,
          PSEUDO: /:((?:[\w\u00c0-\uFFFF\-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
        },
        leftMatch: {},
        attrMap: { class: "className", for: "htmlFor" },
        attrHandle: {
          href: function(a3) {
            return a3.getAttribute("href");
          },
          type: function(a3) {
            return a3.getAttribute("type");
          }
        },
        relative: {
          "+": function(a3, b2) {
            var c2 = typeof b2 == "string", d3 = c2 && !l2.test(b2), e3 = c2 && !d3;
            d3 && (b2 = b2.toLowerCase());
            for (var f2 = 0, g3 = a3.length, h3; f2 < g3; f2++)
              if (h3 = a3[f2]) {
                while ((h3 = h3.previousSibling) && h3.nodeType !== 1)
                  ;
                a3[f2] = e3 || h3 && h3.nodeName.toLowerCase() === b2 ? h3 || false : h3 === b2;
              }
            e3 && m2.filter(b2, a3, true);
          },
          ">": function(a3, b2) {
            var c2, d3 = typeof b2 == "string", e3 = 0, f2 = a3.length;
            if (d3 && !l2.test(b2)) {
              b2 = b2.toLowerCase();
              for (; e3 < f2; e3++) {
                c2 = a3[e3];
                if (c2) {
                  var g3 = c2.parentNode;
                  a3[e3] = g3.nodeName.toLowerCase() === b2 ? g3 : false;
                }
              }
            } else {
              for (; e3 < f2; e3++)
                c2 = a3[e3], c2 && (a3[e3] = d3 ? c2.parentNode : c2.parentNode === b2);
              d3 && m2.filter(b2, a3, true);
            }
          },
          "": function(a3, b2, c2) {
            var d3, f2 = e2++, g3 = x2;
            typeof b2 == "string" && !l2.test(b2) && (b2 = b2.toLowerCase(), d3 = b2, g3 = w2), g3("parentNode", b2, f2, a3, d3, c2);
          },
          "~": function(a3, b2, c2) {
            var d3, f2 = e2++, g3 = x2;
            typeof b2 == "string" && !l2.test(b2) && (b2 = b2.toLowerCase(), d3 = b2, g3 = w2), g3("previousSibling", b2, f2, a3, d3, c2);
          }
        },
        find: {
          ID: function(a3, b2, c2) {
            if (typeof b2.getElementById != "undefined" && !c2) {
              var d3 = b2.getElementById(a3[1]);
              return d3 && d3.parentNode ? [d3] : [];
            }
          },
          NAME: function(a3, b2) {
            if (typeof b2.getElementsByName != "undefined") {
              var c2 = [], d3 = b2.getElementsByName(a3[1]);
              for (var e3 = 0, f2 = d3.length; e3 < f2; e3++)
                d3[e3].getAttribute("name") === a3[1] && c2.push(d3[e3]);
              return c2.length === 0 ? null : c2;
            }
          },
          TAG: function(a3, b2) {
            if (typeof b2.getElementsByTagName != "undefined")
              return b2.getElementsByTagName(a3[1]);
          }
        },
        preFilter: {
          CLASS: function(a3, b2, c2, d3, e3, f2) {
            a3 = " " + a3[1].replace(j2, "") + " ";
            if (f2)
              return a3;
            for (var g3 = 0, h3; (h3 = b2[g3]) != null; g3++)
              h3 && (e3 ^ (h3.className && (" " + h3.className + " ").replace(/[\t\n\r]/g, " ").indexOf(a3) >= 0) ? c2 || d3.push(h3) : c2 && (b2[g3] = false));
            return false;
          },
          ID: function(a3) {
            return a3[1].replace(j2, "");
          },
          TAG: function(a3, b2) {
            return a3[1].replace(j2, "").toLowerCase();
          },
          CHILD: function(a3) {
            if (a3[1] === "nth") {
              a3[2] || m2.error(a3[0]), a3[2] = a3[2].replace(/^\+|\s*/g, "");
              var b2 = /(-?)(\d*)(?:n([+\-]?\d*))?/.exec(
                a3[2] === "even" && "2n" || a3[2] === "odd" && "2n+1" || !/\D/.test(a3[2]) && "0n+" + a3[2] || a3[2]
              );
              a3[2] = b2[1] + (b2[2] || 1) - 0, a3[3] = b2[3] - 0;
            } else
              a3[2] && m2.error(a3[0]);
            a3[0] = e2++;
            return a3;
          },
          ATTR: function(a3, b2, c2, d3, e3, f2) {
            var g3 = a3[1] = a3[1].replace(j2, "");
            !f2 && o2.attrMap[g3] && (a3[1] = o2.attrMap[g3]), a3[4] = (a3[4] || a3[5] || "").replace(j2, ""), a3[2] === "~=" && (a3[4] = " " + a3[4] + " ");
            return a3;
          },
          PSEUDO: function(b2, c2, d3, e3, f2) {
            if (b2[1] === "not")
              if ((a2.exec(b2[3]) || "").length > 1 || /^\w/.test(b2[3]))
                b2[3] = m2(b2[3], null, null, c2);
              else {
                var g3 = m2.filter(b2[3], c2, d3, true ^ f2);
                d3 || e3.push.apply(e3, g3);
                return false;
              }
            else if (o2.match.POS.test(b2[0]) || o2.match.CHILD.test(b2[0]))
              return true;
            return b2;
          },
          POS: function(a3) {
            a3.unshift(true);
            return a3;
          }
        },
        filters: {
          enabled: function(a3) {
            return a3.disabled === false && a3.type !== "hidden";
          },
          disabled: function(a3) {
            return a3.disabled === true;
          },
          checked: function(a3) {
            return a3.checked === true;
          },
          selected: function(a3) {
            a3.parentNode && a3.parentNode.selectedIndex;
            return a3.selected === true;
          },
          parent: function(a3) {
            return !!a3.firstChild;
          },
          empty: function(a3) {
            return !a3.firstChild;
          },
          has: function(a3, b2, c2) {
            return !!m2(c2[3], a3).length;
          },
          header: function(a3) {
            return /h\d/i.test(a3.nodeName);
          },
          text: function(a3) {
            var b2 = a3.getAttribute("type"), c2 = a3.type;
            return a3.nodeName.toLowerCase() === "input" && "text" === c2 && (b2 === c2 || b2 === null);
          },
          radio: function(a3) {
            return a3.nodeName.toLowerCase() === "input" && "radio" === a3.type;
          },
          checkbox: function(a3) {
            return a3.nodeName.toLowerCase() === "input" && "checkbox" === a3.type;
          },
          file: function(a3) {
            return a3.nodeName.toLowerCase() === "input" && "file" === a3.type;
          },
          password: function(a3) {
            return a3.nodeName.toLowerCase() === "input" && "password" === a3.type;
          },
          submit: function(a3) {
            var b2 = a3.nodeName.toLowerCase();
            return (b2 === "input" || b2 === "button") && "submit" === a3.type;
          },
          image: function(a3) {
            return a3.nodeName.toLowerCase() === "input" && "image" === a3.type;
          },
          reset: function(a3) {
            var b2 = a3.nodeName.toLowerCase();
            return (b2 === "input" || b2 === "button") && "reset" === a3.type;
          },
          button: function(a3) {
            var b2 = a3.nodeName.toLowerCase();
            return b2 === "input" && "button" === a3.type || b2 === "button";
          },
          input: function(a3) {
            return /input|select|textarea|button/i.test(a3.nodeName);
          },
          focus: function(a3) {
            return a3 === a3.ownerDocument.activeElement;
          }
        },
        setFilters: {
          first: function(a3, b2) {
            return b2 === 0;
          },
          last: function(a3, b2, c2, d3) {
            return b2 === d3.length - 1;
          },
          even: function(a3, b2) {
            return b2 % 2 === 0;
          },
          odd: function(a3, b2) {
            return b2 % 2 === 1;
          },
          lt: function(a3, b2, c2) {
            return b2 < c2[3] - 0;
          },
          gt: function(a3, b2, c2) {
            return b2 > c2[3] - 0;
          },
          nth: function(a3, b2, c2) {
            return c2[3] - 0 === b2;
          },
          eq: function(a3, b2, c2) {
            return c2[3] - 0 === b2;
          }
        },
        filter: {
          PSEUDO: function(a3, b2, c2, d3) {
            var e3 = b2[1], f2 = o2.filters[e3];
            if (f2)
              return f2(a3, c2, b2, d3);
            if (e3 === "contains")
              return (a3.textContent || a3.innerText || n2([a3]) || "").indexOf(b2[3]) >= 0;
            if (e3 === "not") {
              var g3 = b2[3];
              for (var h3 = 0, i3 = g3.length; h3 < i3; h3++)
                if (g3[h3] === a3)
                  return false;
              return true;
            }
            m2.error(e3);
          },
          CHILD: function(a3, b2) {
            var c2, e3, f2, g3, i3, j3, k3 = b2[1], l3 = a3;
            switch (k3) {
              case "only":
              case "first":
                while (l3 = l3.previousSibling)
                  if (l3.nodeType === 1)
                    return false;
                if (k3 === "first")
                  return true;
                l3 = a3;
              case "last":
                while (l3 = l3.nextSibling)
                  if (l3.nodeType === 1)
                    return false;
                return true;
              case "nth":
                c2 = b2[2], e3 = b2[3];
                if (c2 === 1 && e3 === 0)
                  return true;
                f2 = b2[0], g3 = a3.parentNode;
                if (g3 && (g3[d2] !== f2 || !a3.nodeIndex)) {
                  i3 = 0;
                  for (l3 = g3.firstChild; l3; l3 = l3.nextSibling)
                    l3.nodeType === 1 && (l3.nodeIndex = ++i3);
                  g3[d2] = f2;
                }
                j3 = a3.nodeIndex - e3;
                return c2 === 0 ? j3 === 0 : j3 % c2 === 0 && j3 / c2 >= 0;
            }
          },
          ID: function(a3, b2) {
            return a3.nodeType === 1 && a3.getAttribute("id") === b2;
          },
          TAG: function(a3, b2) {
            return b2 === "*" && a3.nodeType === 1 || !!a3.nodeName && a3.nodeName.toLowerCase() === b2;
          },
          CLASS: function(a3, b2) {
            return (" " + (a3.className || a3.getAttribute("class")) + " ").indexOf(b2) > -1;
          },
          ATTR: function(a3, b2) {
            var c2 = b2[1], d3 = m2.attr ? m2.attr(a3, c2) : o2.attrHandle[c2] ? o2.attrHandle[c2](a3) : a3[c2] != null ? a3[c2] : a3.getAttribute(c2), e3 = d3 + "", f2 = b2[2], g3 = b2[4];
            return d3 == null ? f2 === "!=" : !f2 && m2.attr ? d3 != null : f2 === "=" ? e3 === g3 : f2 === "*=" ? e3.indexOf(g3) >= 0 : f2 === "~=" ? (" " + e3 + " ").indexOf(g3) >= 0 : g3 ? f2 === "!=" ? e3 !== g3 : f2 === "^=" ? e3.indexOf(g3) === 0 : f2 === "$=" ? e3.substr(e3.length - g3.length) === g3 : f2 === "|=" ? e3 === g3 || e3.substr(0, g3.length + 1) === g3 + "-" : false : e3 && d3 !== false;
          },
          POS: function(a3, b2, c2, d3) {
            var e3 = b2[2], f2 = o2.setFilters[e3];
            if (f2)
              return f2(a3, c2, b2, d3);
          }
        }
      }, p2 = o2.match.POS, q2 = function(a3, b2) {
        return "\\" + (b2 - 0 + 1);
      };
      for (var r2 in o2.match)
        o2.match[r2] = new RegExp(o2.match[r2].source + /(?![^\[]*\])(?![^\(]*\))/.source), o2.leftMatch[r2] = new RegExp(/(^(?:.|\r|\n)*?)/.source + o2.match[r2].source.replace(/\\(\d+)/g, q2));
      var s2 = function(a3, b2) {
        a3 = Array.prototype.slice.call(a3, 0);
        if (b2) {
          b2.push.apply(b2, a3);
          return b2;
        }
        return a3;
      };
      try {
        Array.prototype.slice.call(c.documentElement.childNodes, 0)[0].nodeType;
      } catch (t2) {
        s2 = function(a3, b2) {
          var c2 = 0, d3 = b2 || [];
          if (g2.call(a3) === "[object Array]")
            Array.prototype.push.apply(d3, a3);
          else if (typeof a3.length == "number")
            for (var e3 = a3.length; c2 < e3; c2++)
              d3.push(a3[c2]);
          else
            for (; a3[c2]; c2++)
              d3.push(a3[c2]);
          return d3;
        };
      }
      var u2, v2;
      c.documentElement.compareDocumentPosition ? u2 = function(a3, b2) {
        if (a3 === b2) {
          h2 = true;
          return 0;
        }
        if (!a3.compareDocumentPosition || !b2.compareDocumentPosition)
          return a3.compareDocumentPosition ? -1 : 1;
        return a3.compareDocumentPosition(b2) & 4 ? -1 : 1;
      } : (u2 = function(a3, b2) {
        if (a3 === b2) {
          h2 = true;
          return 0;
        }
        if (a3.sourceIndex && b2.sourceIndex)
          return a3.sourceIndex - b2.sourceIndex;
        var c2, d3, e3 = [], f2 = [], g3 = a3.parentNode, i3 = b2.parentNode, j3 = g3;
        if (g3 === i3)
          return v2(a3, b2);
        if (!g3)
          return -1;
        if (!i3)
          return 1;
        while (j3)
          e3.unshift(j3), j3 = j3.parentNode;
        j3 = i3;
        while (j3)
          f2.unshift(j3), j3 = j3.parentNode;
        c2 = e3.length, d3 = f2.length;
        for (var k3 = 0; k3 < c2 && k3 < d3; k3++)
          if (e3[k3] !== f2[k3])
            return v2(e3[k3], f2[k3]);
        return k3 === c2 ? v2(a3, f2[k3], -1) : v2(e3[k3], b2, 1);
      }, v2 = function(a3, b2, c2) {
        if (a3 === b2)
          return c2;
        var d3 = a3.nextSibling;
        while (d3) {
          if (d3 === b2)
            return -1;
          d3 = d3.nextSibling;
        }
        return 1;
      }), function() {
        var a3 = c.createElement("div"), d3 = "script" + new Date().getTime(), e3 = c.documentElement;
        a3.innerHTML = "<a name='" + d3 + "'/>", e3.insertBefore(a3, e3.firstChild), c.getElementById(d3) && (o2.find.ID = function(a4, c2, d4) {
          if (typeof c2.getElementById != "undefined" && !d4) {
            var e4 = c2.getElementById(a4[1]);
            return e4 ? e4.id === a4[1] || typeof e4.getAttributeNode != "undefined" && e4.getAttributeNode("id").nodeValue === a4[1] ? [e4] : b : [];
          }
        }, o2.filter.ID = function(a4, b2) {
          var c2 = typeof a4.getAttributeNode != "undefined" && a4.getAttributeNode("id");
          return a4.nodeType === 1 && c2 && c2.nodeValue === b2;
        }), e3.removeChild(a3), e3 = a3 = null;
      }(), function() {
        var a3 = c.createElement("div");
        a3.appendChild(c.createComment("")), a3.getElementsByTagName("*").length > 0 && (o2.find.TAG = function(a4, b2) {
          var c2 = b2.getElementsByTagName(a4[1]);
          if (a4[1] === "*") {
            var d3 = [];
            for (var e3 = 0; c2[e3]; e3++)
              c2[e3].nodeType === 1 && d3.push(c2[e3]);
            c2 = d3;
          }
          return c2;
        }), a3.innerHTML = "<a href='#'></a>", a3.firstChild && typeof a3.firstChild.getAttribute != "undefined" && a3.firstChild.getAttribute("href") !== "#" && (o2.attrHandle.href = function(a4) {
          return a4.getAttribute("href", 2);
        }), a3 = null;
      }(), c.querySelectorAll && function() {
        var a3 = m2, b2 = c.createElement("div"), d3 = "__sizzle__";
        b2.innerHTML = "<p class='TEST'></p>";
        if (!b2.querySelectorAll || b2.querySelectorAll(".TEST").length !== 0) {
          m2 = function(b3, e4, f2, g3) {
            e4 = e4 || c;
            if (!g3 && !m2.isXML(e4)) {
              var h3 = /^(\w+$)|^\.([\w\-]+$)|^#([\w\-]+$)/.exec(b3);
              if (h3 && (e4.nodeType === 1 || e4.nodeType === 9)) {
                if (h3[1])
                  return s2(e4.getElementsByTagName(b3), f2);
                if (h3[2] && o2.find.CLASS && e4.getElementsByClassName)
                  return s2(e4.getElementsByClassName(h3[2]), f2);
              }
              if (e4.nodeType === 9) {
                if (b3 === "body" && e4.body)
                  return s2([e4.body], f2);
                if (h3 && h3[3]) {
                  var i3 = e4.getElementById(h3[3]);
                  if (!i3 || !i3.parentNode)
                    return s2([], f2);
                  if (i3.id === h3[3])
                    return s2([i3], f2);
                }
                try {
                  return s2(e4.querySelectorAll(b3), f2);
                } catch (j3) {
                }
              } else if (e4.nodeType === 1 && e4.nodeName.toLowerCase() !== "object") {
                var k3 = e4, l3 = e4.getAttribute("id"), n3 = l3 || d3, p3 = e4.parentNode, q3 = /^\s*[+~]/.test(b3);
                l3 ? n3 = n3.replace(/'/g, "\\$&") : e4.setAttribute("id", n3), q3 && p3 && (e4 = e4.parentNode);
                try {
                  if (!q3 || p3)
                    return s2(e4.querySelectorAll("[id='" + n3 + "'] " + b3), f2);
                } catch (r3) {
                } finally {
                  l3 || k3.removeAttribute("id");
                }
              }
            }
            return a3(b3, e4, f2, g3);
          };
          for (var e3 in a3)
            m2[e3] = a3[e3];
          b2 = null;
        }
      }(), function() {
        var a3 = c.documentElement, b2 = a3.matchesSelector || a3.mozMatchesSelector || a3.webkitMatchesSelector || a3.msMatchesSelector;
        if (b2) {
          var d3 = !b2.call(c.createElement("div"), "div"), e3 = false;
          try {
            b2.call(c.documentElement, "[test!='']:sizzle");
          } catch (f2) {
            e3 = true;
          }
          m2.matchesSelector = function(a4, c2) {
            c2 = c2.replace(/\=\s*([^'"\]]*)\s*\]/g, "='$1']");
            if (!m2.isXML(a4))
              try {
                if (e3 || !o2.match.PSEUDO.test(c2) && !/!=/.test(c2)) {
                  var f2 = b2.call(a4, c2);
                  if (f2 || !d3 || a4.document && a4.document.nodeType !== 11)
                    return f2;
                }
              } catch (g3) {
              }
            return m2(c2, null, null, [a4]).length > 0;
          };
        }
      }(), function() {
        var a3 = c.createElement("div");
        a3.innerHTML = "<div class='test e'></div><div class='test'></div>";
        if (!!a3.getElementsByClassName && a3.getElementsByClassName("e").length !== 0) {
          a3.lastChild.className = "e";
          if (a3.getElementsByClassName("e").length === 1)
            return;
          o2.order.splice(1, 0, "CLASS"), o2.find.CLASS = function(a4, b2, c2) {
            if (typeof b2.getElementsByClassName != "undefined" && !c2)
              return b2.getElementsByClassName(a4[1]);
          }, a3 = null;
        }
      }(), c.documentElement.contains ? m2.contains = function(a3, b2) {
        return a3 !== b2 && (a3.contains ? a3.contains(b2) : true);
      } : c.documentElement.compareDocumentPosition ? m2.contains = function(a3, b2) {
        return !!(a3.compareDocumentPosition(b2) & 16);
      } : m2.contains = function() {
        return false;
      }, m2.isXML = function(a3) {
        var b2 = (a3 ? a3.ownerDocument || a3 : 0).documentElement;
        return b2 ? b2.nodeName !== "HTML" : false;
      };
      var y2 = function(a3, b2, c2) {
        var d3, e3 = [], f2 = "", g3 = b2.nodeType ? [b2] : b2;
        while (d3 = o2.match.PSEUDO.exec(a3))
          f2 += d3[0], a3 = a3.replace(o2.match.PSEUDO, "");
        a3 = o2.relative[a3] ? a3 + "*" : a3;
        for (var h3 = 0, i3 = g3.length; h3 < i3; h3++)
          m2(a3, g3[h3], e3, c2);
        return m2.filter(f2, e3);
      };
      m2.attr = f.attr, m2.selectors.attrMap = {}, f.find = m2, f.expr = m2.selectors, f.expr[":"] = f.expr.filters, f.unique = m2.uniqueSort, f.text = m2.getText, f.isXMLDoc = m2.isXML, f.contains = m2.contains;
    }();
    var O = /Until$/, P = /^(?:parents|prevUntil|prevAll)/, Q = /,/, R = /^.[^:#\[\.,]*$/, S = Array.prototype.slice, T = f.expr.match.POS, U = { children: true, contents: true, next: true, prev: true };
    f.fn.extend({
      find: function(a2) {
        var b2 = this, c2, d2;
        if (typeof a2 != "string")
          return f(a2).filter(function() {
            for (c2 = 0, d2 = b2.length; c2 < d2; c2++)
              if (f.contains(b2[c2], this))
                return true;
          });
        var e2 = this.pushStack("", "find", a2), g2, h2, i2;
        for (c2 = 0, d2 = this.length; c2 < d2; c2++) {
          g2 = e2.length, f.find(a2, this[c2], e2);
          if (c2 > 0) {
            for (h2 = g2; h2 < e2.length; h2++)
              for (i2 = 0; i2 < g2; i2++)
                if (e2[i2] === e2[h2]) {
                  e2.splice(h2--, 1);
                  break;
                }
          }
        }
        return e2;
      },
      has: function(a2) {
        var b2 = f(a2);
        return this.filter(function() {
          for (var a3 = 0, c2 = b2.length; a3 < c2; a3++)
            if (f.contains(this, b2[a3]))
              return true;
        });
      },
      not: function(a2) {
        return this.pushStack(W(this, a2, false), "not", a2);
      },
      filter: function(a2) {
        return this.pushStack(W(this, a2, true), "filter", a2);
      },
      is: function(a2) {
        return !!a2 && (typeof a2 == "string" ? T.test(a2) ? f(a2, this.context).index(this[0]) >= 0 : f.filter(a2, this).length > 0 : this.filter(a2).length > 0);
      },
      closest: function(a2, b2) {
        var c2 = [], d2, e2, g2 = this[0];
        if (f.isArray(a2)) {
          var h2 = 1;
          while (g2 && g2.ownerDocument && g2 !== b2) {
            for (d2 = 0; d2 < a2.length; d2++)
              f(g2).is(a2[d2]) && c2.push({ selector: a2[d2], elem: g2, level: h2 });
            g2 = g2.parentNode, h2++;
          }
          return c2;
        }
        var i2 = T.test(a2) || typeof a2 != "string" ? f(a2, b2 || this.context) : 0;
        for (d2 = 0, e2 = this.length; d2 < e2; d2++) {
          g2 = this[d2];
          while (g2) {
            if (i2 ? i2.index(g2) > -1 : f.find.matchesSelector(g2, a2)) {
              c2.push(g2);
              break;
            }
            g2 = g2.parentNode;
            if (!g2 || !g2.ownerDocument || g2 === b2 || g2.nodeType === 11)
              break;
          }
        }
        c2 = c2.length > 1 ? f.unique(c2) : c2;
        return this.pushStack(c2, "closest", a2);
      },
      index: function(a2) {
        if (!a2)
          return this[0] && this[0].parentNode ? this.prevAll().length : -1;
        if (typeof a2 == "string")
          return f.inArray(this[0], f(a2));
        return f.inArray(a2.jquery ? a2[0] : a2, this);
      },
      add: function(a2, b2) {
        var c2 = typeof a2 == "string" ? f(a2, b2) : f.makeArray(a2 && a2.nodeType ? [a2] : a2), d2 = f.merge(this.get(), c2);
        return this.pushStack(V(c2[0]) || V(d2[0]) ? d2 : f.unique(d2));
      },
      andSelf: function() {
        return this.add(this.prevObject);
      }
    }), f.each(
      {
        parent: function(a2) {
          var b2 = a2.parentNode;
          return b2 && b2.nodeType !== 11 ? b2 : null;
        },
        parents: function(a2) {
          return f.dir(a2, "parentNode");
        },
        parentsUntil: function(a2, b2, c2) {
          return f.dir(a2, "parentNode", c2);
        },
        next: function(a2) {
          return f.nth(a2, 2, "nextSibling");
        },
        prev: function(a2) {
          return f.nth(a2, 2, "previousSibling");
        },
        nextAll: function(a2) {
          return f.dir(a2, "nextSibling");
        },
        prevAll: function(a2) {
          return f.dir(a2, "previousSibling");
        },
        nextUntil: function(a2, b2, c2) {
          return f.dir(a2, "nextSibling", c2);
        },
        prevUntil: function(a2, b2, c2) {
          return f.dir(a2, "previousSibling", c2);
        },
        siblings: function(a2) {
          return f.sibling(a2.parentNode.firstChild, a2);
        },
        children: function(a2) {
          return f.sibling(a2.firstChild);
        },
        contents: function(a2) {
          return f.nodeName(a2, "iframe") ? a2.contentDocument || a2.contentWindow.document : f.makeArray(a2.childNodes);
        }
      },
      function(a2, b2) {
        f.fn[a2] = function(c2, d2) {
          var e2 = f.map(this, b2, c2), g2 = S.call(arguments);
          O.test(a2) || (d2 = c2), d2 && typeof d2 == "string" && (e2 = f.filter(d2, e2)), e2 = this.length > 1 && !U[a2] ? f.unique(e2) : e2, (this.length > 1 || Q.test(d2)) && P.test(a2) && (e2 = e2.reverse());
          return this.pushStack(e2, a2, g2.join(","));
        };
      }
    ), f.extend({
      filter: function(a2, b2, c2) {
        c2 && (a2 = ":not(" + a2 + ")");
        return b2.length === 1 ? f.find.matchesSelector(b2[0], a2) ? [b2[0]] : [] : f.find.matches(a2, b2);
      },
      dir: function(a2, c2, d2) {
        var e2 = [], g2 = a2[c2];
        while (g2 && g2.nodeType !== 9 && (d2 === b || g2.nodeType !== 1 || !f(g2).is(d2)))
          g2.nodeType === 1 && e2.push(g2), g2 = g2[c2];
        return e2;
      },
      nth: function(a2, b2, c2, d2) {
        b2 = b2 || 1;
        var e2 = 0;
        for (; a2; a2 = a2[c2])
          if (a2.nodeType === 1 && ++e2 === b2)
            break;
        return a2;
      },
      sibling: function(a2, b2) {
        var c2 = [];
        for (; a2; a2 = a2.nextSibling)
          a2.nodeType === 1 && a2 !== b2 && c2.push(a2);
        return c2;
      }
    });
    var Y = "abbr article aside audio canvas datalist details figcaption figure footer header hgroup mark meter nav output progress section summary time video", Z = / jQuery\d+="(?:\d+|null)"/g, $2 = /^\s+/, _ = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi, ba = /<([\w:]+)/, bb = /<tbody/i, bc = /<|&#?\w+;/, bd = /<(?:script|style)/i, be = /<(?:script|object|embed|option|style)/i, bf = new RegExp("<(?:" + Y.replace(" ", "|") + ")", "i"), bg = /checked\s*(?:[^=]|=\s*.checked.)/i, bh = /\/(java|ecma)script/i, bi = /^\s*<!(?:\[CDATA\[|\-\-)/, bj = {
      option: [1, "<select multiple='multiple'>", "</select>"],
      legend: [1, "<fieldset>", "</fieldset>"],
      thead: [1, "<table>", "</table>"],
      tr: [2, "<table><tbody>", "</tbody></table>"],
      td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
      col: [2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"],
      area: [1, "<map>", "</map>"],
      _default: [0, "", ""]
    }, bk = X(c);
    bj.optgroup = bj.option, bj.tbody = bj.tfoot = bj.colgroup = bj.caption = bj.thead, bj.th = bj.td, f.support.htmlSerialize || (bj._default = [1, "div<div>", "</div>"]), f.fn.extend({
      text: function(a2) {
        if (f.isFunction(a2))
          return this.each(function(b2) {
            var c2 = f(this);
            c2.text(a2.call(this, b2, c2.text()));
          });
        if (typeof a2 != "object" && a2 !== b)
          return this.empty().append((this[0] && this[0].ownerDocument || c).createTextNode(a2));
        return f.text(this);
      },
      wrapAll: function(a2) {
        if (f.isFunction(a2))
          return this.each(function(b3) {
            f(this).wrapAll(a2.call(this, b3));
          });
        if (this[0]) {
          var b2 = f(a2, this[0].ownerDocument).eq(0).clone(true);
          this[0].parentNode && b2.insertBefore(this[0]), b2.map(function() {
            var a3 = this;
            while (a3.firstChild && a3.firstChild.nodeType === 1)
              a3 = a3.firstChild;
            return a3;
          }).append(this);
        }
        return this;
      },
      wrapInner: function(a2) {
        if (f.isFunction(a2))
          return this.each(function(b2) {
            f(this).wrapInner(a2.call(this, b2));
          });
        return this.each(function() {
          var b2 = f(this), c2 = b2.contents();
          c2.length ? c2.wrapAll(a2) : b2.append(a2);
        });
      },
      wrap: function(a2) {
        return this.each(function() {
          f(this).wrapAll(a2);
        });
      },
      unwrap: function() {
        return this.parent().each(function() {
          f.nodeName(this, "body") || f(this).replaceWith(this.childNodes);
        }).end();
      },
      append: function() {
        return this.domManip(arguments, true, function(a2) {
          this.nodeType === 1 && this.appendChild(a2);
        });
      },
      prepend: function() {
        return this.domManip(arguments, true, function(a2) {
          this.nodeType === 1 && this.insertBefore(a2, this.firstChild);
        });
      },
      before: function() {
        if (this[0] && this[0].parentNode)
          return this.domManip(arguments, false, function(a3) {
            this.parentNode.insertBefore(a3, this);
          });
        if (arguments.length) {
          var a2 = f(arguments[0]);
          a2.push.apply(a2, this.toArray());
          return this.pushStack(a2, "before", arguments);
        }
      },
      after: function() {
        if (this[0] && this[0].parentNode)
          return this.domManip(arguments, false, function(a3) {
            this.parentNode.insertBefore(a3, this.nextSibling);
          });
        if (arguments.length) {
          var a2 = this.pushStack(this, "after", arguments);
          a2.push.apply(a2, f(arguments[0]).toArray());
          return a2;
        }
      },
      remove: function(a2, b2) {
        for (var c2 = 0, d2; (d2 = this[c2]) != null; c2++)
          if (!a2 || f.filter(a2, [d2]).length)
            !b2 && d2.nodeType === 1 && (f.cleanData(d2.getElementsByTagName("*")), f.cleanData([d2])), d2.parentNode && d2.parentNode.removeChild(d2);
        return this;
      },
      empty: function() {
        for (var a2 = 0, b2; (b2 = this[a2]) != null; a2++) {
          b2.nodeType === 1 && f.cleanData(b2.getElementsByTagName("*"));
          while (b2.firstChild)
            b2.removeChild(b2.firstChild);
        }
        return this;
      },
      clone: function(a2, b2) {
        a2 = a2 == null ? false : a2, b2 = b2 == null ? a2 : b2;
        return this.map(function() {
          return f.clone(this, a2, b2);
        });
      },
      html: function(a2) {
        if (a2 === b)
          return this[0] && this[0].nodeType === 1 ? this[0].innerHTML.replace(Z, "") : null;
        if (typeof a2 == "string" && !bd.test(a2) && (f.support.leadingWhitespace || !$2.test(a2)) && !bj[(ba.exec(a2) || ["", ""])[1].toLowerCase()]) {
          a2 = a2.replace(_, "<$1></$2>");
          try {
            for (var c2 = 0, d2 = this.length; c2 < d2; c2++)
              this[c2].nodeType === 1 && (f.cleanData(this[c2].getElementsByTagName("*")), this[c2].innerHTML = a2);
          } catch (e2) {
            this.empty().append(a2);
          }
        } else
          f.isFunction(a2) ? this.each(function(b2) {
            var c3 = f(this);
            c3.html(a2.call(this, b2, c3.html()));
          }) : this.empty().append(a2);
        return this;
      },
      replaceWith: function(a2) {
        if (this[0] && this[0].parentNode) {
          if (f.isFunction(a2))
            return this.each(function(b2) {
              var c2 = f(this), d2 = c2.html();
              c2.replaceWith(a2.call(this, b2, d2));
            });
          typeof a2 != "string" && (a2 = f(a2).detach());
          return this.each(function() {
            var b2 = this.nextSibling, c2 = this.parentNode;
            f(this).remove(), b2 ? f(b2).before(a2) : f(c2).append(a2);
          });
        }
        return this.length ? this.pushStack(f(f.isFunction(a2) ? a2() : a2), "replaceWith", a2) : this;
      },
      detach: function(a2) {
        return this.remove(a2, true);
      },
      domManip: function(a2, c2, d2) {
        var e2, g2, h2, i2, j2 = a2[0], k2 = [];
        if (!f.support.checkClone && arguments.length === 3 && typeof j2 == "string" && bg.test(j2))
          return this.each(function() {
            f(this).domManip(a2, c2, d2, true);
          });
        if (f.isFunction(j2))
          return this.each(function(e3) {
            var g3 = f(this);
            a2[0] = j2.call(this, e3, c2 ? g3.html() : b), g3.domManip(a2, c2, d2);
          });
        if (this[0]) {
          i2 = j2 && j2.parentNode, f.support.parentNode && i2 && i2.nodeType === 11 && i2.childNodes.length === this.length ? e2 = { fragment: i2 } : e2 = f.buildFragment(a2, this, k2), h2 = e2.fragment, h2.childNodes.length === 1 ? g2 = h2 = h2.firstChild : g2 = h2.firstChild;
          if (g2) {
            c2 = c2 && f.nodeName(g2, "tr");
            for (var l2 = 0, m2 = this.length, n2 = m2 - 1; l2 < m2; l2++)
              d2.call(c2 ? bl(this[l2]) : this[l2], e2.cacheable || m2 > 1 && l2 < n2 ? f.clone(h2, true, true) : h2);
          }
          k2.length && f.each(k2, br);
        }
        return this;
      }
    }), f.buildFragment = function(a2, b2, d2) {
      var e2, g2, h2, i2, j2 = a2[0];
      b2 && b2[0] && (i2 = b2[0].ownerDocument || b2[0]), i2.createDocumentFragment || (i2 = c), a2.length === 1 && typeof j2 == "string" && j2.length < 512 && i2 === c && j2.charAt(0) === "<" && !be.test(j2) && (f.support.checkClone || !bg.test(j2)) && !f.support.unknownElems && bf.test(j2) && (g2 = true, h2 = f.fragments[j2], h2 && h2 !== 1 && (e2 = h2)), e2 || (e2 = i2.createDocumentFragment(), f.clean(a2, i2, e2, d2)), g2 && (f.fragments[j2] = h2 ? e2 : 1);
      return { fragment: e2, cacheable: g2 };
    }, f.fragments = {}, f.each(
      {
        appendTo: "append",
        prependTo: "prepend",
        insertBefore: "before",
        insertAfter: "after",
        replaceAll: "replaceWith"
      },
      function(a2, b2) {
        f.fn[a2] = function(c2) {
          var d2 = [], e2 = f(c2), g2 = this.length === 1 && this[0].parentNode;
          if (g2 && g2.nodeType === 11 && g2.childNodes.length === 1 && e2.length === 1) {
            e2[b2](this[0]);
            return this;
          }
          for (var h2 = 0, i2 = e2.length; h2 < i2; h2++) {
            var j2 = (h2 > 0 ? this.clone(true) : this).get();
            f(e2[h2])[b2](j2), d2 = d2.concat(j2);
          }
          return this.pushStack(d2, a2, e2.selector);
        };
      }
    ), f.extend({
      clone: function(a2, b2, c2) {
        var d2 = a2.cloneNode(true), e2, g2, h2;
        if ((!f.support.noCloneEvent || !f.support.noCloneChecked) && (a2.nodeType === 1 || a2.nodeType === 11) && !f.isXMLDoc(a2)) {
          bn(a2, d2), e2 = bo(a2), g2 = bo(d2);
          for (h2 = 0; e2[h2]; ++h2)
            g2[h2] && bn(e2[h2], g2[h2]);
        }
        if (b2) {
          bm(a2, d2);
          if (c2) {
            e2 = bo(a2), g2 = bo(d2);
            for (h2 = 0; e2[h2]; ++h2)
              bm(e2[h2], g2[h2]);
          }
        }
        e2 = g2 = null;
        return d2;
      },
      clean: function(a2, b2, d2, e2) {
        var g2;
        b2 = b2 || c, typeof b2.createElement == "undefined" && (b2 = b2.ownerDocument || b2[0] && b2[0].ownerDocument || c);
        var h2 = [], i2;
        for (var j2 = 0, k2; (k2 = a2[j2]) != null; j2++) {
          typeof k2 == "number" && (k2 += "");
          if (!k2)
            continue;
          if (typeof k2 == "string")
            if (!bc.test(k2))
              k2 = b2.createTextNode(k2);
            else {
              k2 = k2.replace(_, "<$1></$2>");
              var l2 = (ba.exec(k2) || ["", ""])[1].toLowerCase(), m2 = bj[l2] || bj._default, n2 = m2[0], o2 = b2.createElement("div");
              b2 === c ? bk.appendChild(o2) : X(b2).appendChild(o2), o2.innerHTML = m2[1] + k2 + m2[2];
              while (n2--)
                o2 = o2.lastChild;
              if (!f.support.tbody) {
                var p2 = bb.test(k2), q2 = l2 === "table" && !p2 ? o2.firstChild && o2.firstChild.childNodes : m2[1] === "<table>" && !p2 ? o2.childNodes : [];
                for (i2 = q2.length - 1; i2 >= 0; --i2)
                  f.nodeName(q2[i2], "tbody") && !q2[i2].childNodes.length && q2[i2].parentNode.removeChild(q2[i2]);
              }
              !f.support.leadingWhitespace && $2.test(k2) && o2.insertBefore(b2.createTextNode($2.exec(k2)[0]), o2.firstChild), k2 = o2.childNodes;
            }
          var r2;
          if (!f.support.appendChecked)
            if (k2[0] && typeof (r2 = k2.length) == "number")
              for (i2 = 0; i2 < r2; i2++)
                bq(k2[i2]);
            else
              bq(k2);
          k2.nodeType ? h2.push(k2) : h2 = f.merge(h2, k2);
        }
        if (d2) {
          g2 = function(a3) {
            return !a3.type || bh.test(a3.type);
          };
          for (j2 = 0; h2[j2]; j2++)
            if (e2 && f.nodeName(h2[j2], "script") && (!h2[j2].type || h2[j2].type.toLowerCase() === "text/javascript"))
              e2.push(h2[j2].parentNode ? h2[j2].parentNode.removeChild(h2[j2]) : h2[j2]);
            else {
              if (h2[j2].nodeType === 1) {
                var s2 = f.grep(h2[j2].getElementsByTagName("script"), g2);
                h2.splice.apply(h2, [j2 + 1, 0].concat(s2));
              }
              d2.appendChild(h2[j2]);
            }
        }
        return h2;
      },
      cleanData: function(a2) {
        var b2, c2, d2 = f.cache, e2 = f.event.special, g2 = f.support.deleteExpando;
        for (var h2 = 0, i2; (i2 = a2[h2]) != null; h2++) {
          if (i2.nodeName && f.noData[i2.nodeName.toLowerCase()])
            continue;
          c2 = i2[f.expando];
          if (c2) {
            b2 = d2[c2];
            if (b2 && b2.events) {
              for (var j2 in b2.events)
                e2[j2] ? f.event.remove(i2, j2) : f.removeEvent(i2, j2, b2.handle);
              b2.handle && (b2.handle.elem = null);
            }
            g2 ? delete i2[f.expando] : i2.removeAttribute && i2.removeAttribute(f.expando), delete d2[c2];
          }
        }
      }
    });
    var bs = /alpha\([^)]*\)/i, bt = /opacity=([^)]*)/, bu = /([A-Z]|^ms)/g, bv = /^-?\d+(?:px)?$/i, bw = /^-?\d/, bx = /^([\-+])=([\-+.\de]+)/, by = { position: "absolute", visibility: "hidden", display: "block" }, bz = ["Left", "Right"], bA = ["Top", "Bottom"], bB, bC, bD;
    f.fn.css = function(a2, c2) {
      if (arguments.length === 2 && c2 === b)
        return this;
      return f.access(this, a2, c2, true, function(a3, c3, d2) {
        return d2 !== b ? f.style(a3, c3, d2) : f.css(a3, c3);
      });
    }, f.extend({
      cssHooks: {
        opacity: {
          get: function(a2, b2) {
            if (b2) {
              var c2 = bB(a2, "opacity", "opacity");
              return c2 === "" ? "1" : c2;
            }
            return a2.style.opacity;
          }
        }
      },
      cssNumber: {
        fillOpacity: true,
        fontWeight: true,
        lineHeight: true,
        opacity: true,
        orphans: true,
        widows: true,
        zIndex: true,
        zoom: true
      },
      cssProps: { float: f.support.cssFloat ? "cssFloat" : "styleFloat" },
      style: function(a2, c2, d2, e2) {
        if (!!a2 && a2.nodeType !== 3 && a2.nodeType !== 8 && !!a2.style) {
          var g2, h2, i2 = f.camelCase(c2), j2 = a2.style, k2 = f.cssHooks[i2];
          c2 = f.cssProps[i2] || i2;
          if (d2 === b) {
            if (k2 && "get" in k2 && (g2 = k2.get(a2, false, e2)) !== b)
              return g2;
            return j2[c2];
          }
          h2 = typeof d2, h2 === "string" && (g2 = bx.exec(d2)) && (d2 = +(g2[1] + 1) * +g2[2] + parseFloat(f.css(a2, c2)), h2 = "number");
          if (d2 == null || h2 === "number" && isNaN(d2))
            return;
          h2 === "number" && !f.cssNumber[i2] && (d2 += "px");
          if (!k2 || !("set" in k2) || (d2 = k2.set(a2, d2)) !== b)
            try {
              j2[c2] = d2;
            } catch (l2) {
            }
        }
      },
      css: function(a2, c2, d2) {
        var e2, g2;
        c2 = f.camelCase(c2), g2 = f.cssHooks[c2], c2 = f.cssProps[c2] || c2, c2 === "cssFloat" && (c2 = "float");
        if (g2 && "get" in g2 && (e2 = g2.get(a2, true, d2)) !== b)
          return e2;
        if (bB)
          return bB(a2, c2);
      },
      swap: function(a2, b2, c2) {
        var d2 = {};
        for (var e2 in b2)
          d2[e2] = a2.style[e2], a2.style[e2] = b2[e2];
        c2.call(a2);
        for (e2 in b2)
          a2.style[e2] = d2[e2];
      }
    }), f.curCSS = f.css, f.each(["height", "width"], function(a2, b2) {
      f.cssHooks[b2] = {
        get: function(a3, c2, d2) {
          var e2;
          if (c2) {
            if (a3.offsetWidth !== 0)
              return bE(a3, b2, d2);
            f.swap(a3, by, function() {
              e2 = bE(a3, b2, d2);
            });
            return e2;
          }
        },
        set: function(a3, b3) {
          if (!bv.test(b3))
            return b3;
          b3 = parseFloat(b3);
          if (b3 >= 0)
            return b3 + "px";
        }
      };
    }), f.support.opacity || (f.cssHooks.opacity = {
      get: function(a2, b2) {
        return bt.test((b2 && a2.currentStyle ? a2.currentStyle.filter : a2.style.filter) || "") ? parseFloat(RegExp.$1) / 100 + "" : b2 ? "1" : "";
      },
      set: function(a2, b2) {
        var c2 = a2.style, d2 = a2.currentStyle, e2 = f.isNumeric(b2) ? "alpha(opacity=" + b2 * 100 + ")" : "", g2 = d2 && d2.filter || c2.filter || "";
        c2.zoom = 1;
        if (b2 >= 1 && f.trim(g2.replace(bs, "")) === "") {
          c2.removeAttribute("filter");
          if (d2 && !d2.filter)
            return;
        }
        c2.filter = bs.test(g2) ? g2.replace(bs, e2) : g2 + " " + e2;
      }
    }), f(function() {
      f.support.reliableMarginRight || (f.cssHooks.marginRight = {
        get: function(a2, b2) {
          var c2;
          f.swap(a2, { display: "inline-block" }, function() {
            b2 ? c2 = bB(a2, "margin-right", "marginRight") : c2 = a2.style.marginRight;
          });
          return c2;
        }
      });
    }), c.defaultView && c.defaultView.getComputedStyle && (bC = function(a2, c2) {
      var d2, e2, g2;
      c2 = c2.replace(bu, "-$1").toLowerCase();
      if (!(e2 = a2.ownerDocument.defaultView))
        return b;
      if (g2 = e2.getComputedStyle(a2, null))
        d2 = g2.getPropertyValue(c2), d2 === "" && !f.contains(a2.ownerDocument.documentElement, a2) && (d2 = f.style(a2, c2));
      return d2;
    }), c.documentElement.currentStyle && (bD = function(a2, b2) {
      var c2, d2, e2, f2 = a2.currentStyle && a2.currentStyle[b2], g2 = a2.style;
      f2 === null && g2 && (e2 = g2[b2]) && (f2 = e2), !bv.test(f2) && bw.test(f2) && (c2 = g2.left, d2 = a2.runtimeStyle && a2.runtimeStyle.left, d2 && (a2.runtimeStyle.left = a2.currentStyle.left), g2.left = b2 === "fontSize" ? "1em" : f2 || 0, f2 = g2.pixelLeft + "px", g2.left = c2, d2 && (a2.runtimeStyle.left = d2));
      return f2 === "" ? "auto" : f2;
    }), bB = bC || bD, f.expr && f.expr.filters && (f.expr.filters.hidden = function(a2) {
      var b2 = a2.offsetWidth, c2 = a2.offsetHeight;
      return b2 === 0 && c2 === 0 || !f.support.reliableHiddenOffsets && (a2.style && a2.style.display || f.css(a2, "display")) === "none";
    }, f.expr.filters.visible = function(a2) {
      return !f.expr.filters.hidden(a2);
    });
    var bF = /%20/g, bG = /\[\]$/, bH = /\r?\n/g, bI = /#.*$/, bJ = /^(.*?):[ \t]*([^\r\n]*)\r?$/gm, bK = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i, bL = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/, bM = /^(?:GET|HEAD)$/, bN = /^\/\//, bO = /\?/, bP = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, bQ = /^(?:select|textarea)/i, bR = /\s+/, bS = /([?&])_=[^&]*/, bT = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/, bU = f.fn.load, bV = {}, bW = {}, bX, bY, bZ = ["*/"] + ["*"];
    try {
      bX = e.href;
    } catch (b$) {
      bX = c.createElement("a"), bX.href = "", bX = bX.href;
    }
    bY = bT.exec(bX.toLowerCase()) || [], f.fn.extend({
      load: function(a2, c2, d2) {
        if (typeof a2 != "string" && bU)
          return bU.apply(this, arguments);
        if (!this.length)
          return this;
        var e2 = a2.indexOf(" ");
        if (e2 >= 0) {
          var g2 = a2.slice(e2, a2.length);
          a2 = a2.slice(0, e2);
        }
        var h2 = "GET";
        c2 && (f.isFunction(c2) ? (d2 = c2, c2 = b) : typeof c2 == "object" && (c2 = f.param(c2, f.ajaxSettings.traditional), h2 = "POST"));
        var i2 = this;
        f.ajax({
          url: a2,
          type: h2,
          dataType: "html",
          data: c2,
          complete: function(a3, b2, c3) {
            c3 = a3.responseText, a3.isResolved() && (a3.done(function(a4) {
              c3 = a4;
            }), i2.html(g2 ? f("<div>").append(c3.replace(bP, "")).find(g2) : c3)), d2 && i2.each(d2, [c3, b2, a3]);
          }
        });
        return this;
      },
      serialize: function() {
        return f.param(this.serializeArray());
      },
      serializeArray: function() {
        return this.map(function() {
          return this.elements ? f.makeArray(this.elements) : this;
        }).filter(function() {
          return this.name && !this.disabled && (this.checked || bQ.test(this.nodeName) || bK.test(this.type));
        }).map(function(a2, b2) {
          var c2 = f(this).val();
          return c2 == null ? null : f.isArray(c2) ? f.map(c2, function(a3, c3) {
            return { name: b2.name, value: a3.replace(bH, "\r\n") };
          }) : { name: b2.name, value: c2.replace(bH, "\r\n") };
        }).get();
      }
    }), f.each("ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split(" "), function(a2, b2) {
      f.fn[b2] = function(a3) {
        return this.bind(b2, a3);
      };
    }), f.each(["get", "post"], function(a2, c2) {
      f[c2] = function(a3, d2, e2, g2) {
        f.isFunction(d2) && (g2 = g2 || e2, e2 = d2, d2 = b);
        return f.ajax({ type: c2, url: a3, data: d2, success: e2, dataType: g2 });
      };
    }), f.extend({
      getScript: function(a2, c2) {
        return f.get(a2, b, c2, "script");
      },
      getJSON: function(a2, b2, c2) {
        return f.get(a2, b2, c2, "json");
      },
      ajaxSetup: function(a2, b2) {
        b2 ? cb(a2, f.ajaxSettings) : (b2 = a2, a2 = f.ajaxSettings), cb(a2, b2);
        return a2;
      },
      ajaxSettings: {
        url: bX,
        isLocal: bL.test(bY[1]),
        global: true,
        type: "GET",
        contentType: "application/x-www-form-urlencoded",
        processData: true,
        async: true,
        accepts: {
          xml: "application/xml, text/xml",
          html: "text/html",
          text: "text/plain",
          json: "application/json, text/javascript",
          "*": bZ
        },
        contents: { xml: /xml/, html: /html/, json: /json/ },
        responseFields: { xml: "responseXML", text: "responseText" },
        converters: { "* text": a.String, "text html": true, "text json": f.parseJSON, "text xml": f.parseXML },
        flatOptions: { context: true, url: true }
      },
      ajaxPrefilter: b_(bV),
      ajaxTransport: b_(bW),
      ajax: function(a2, c2) {
        function w2(a3, c3, l3, m3) {
          if (s2 !== 2) {
            s2 = 2, q2 && clearTimeout(q2), p2 = b, n2 = m3 || "", v2.readyState = a3 > 0 ? 4 : 0;
            var o3, r3, u3, w3 = c3, x3 = l3 ? cd(d2, v2, l3) : b, y3, z;
            if (a3 >= 200 && a3 < 300 || a3 === 304) {
              if (d2.ifModified) {
                if (y3 = v2.getResponseHeader("Last-Modified"))
                  f.lastModified[k2] = y3;
                if (z = v2.getResponseHeader("Etag"))
                  f.etag[k2] = z;
              }
              if (a3 === 304)
                w3 = "notmodified", o3 = true;
              else
                try {
                  r3 = ce(d2, x3), w3 = "success", o3 = true;
                } catch (A2) {
                  w3 = "parsererror", u3 = A2;
                }
            } else {
              u3 = w3;
              if (!w3 || a3)
                w3 = "error", a3 < 0 && (a3 = 0);
            }
            v2.status = a3, v2.statusText = "" + (c3 || w3), o3 ? h2.resolveWith(e2, [r3, w3, v2]) : h2.rejectWith(e2, [v2, w3, u3]), v2.statusCode(j2), j2 = b, t2 && g2.trigger("ajax" + (o3 ? "Success" : "Error"), [v2, d2, o3 ? r3 : u3]), i2.fireWith(e2, [v2, w3]), t2 && (g2.trigger("ajaxComplete", [v2, d2]), --f.active || f.event.trigger("ajaxStop"));
          }
        }
        typeof a2 == "object" && (c2 = a2, a2 = b), c2 = c2 || {};
        var d2 = f.ajaxSetup({}, c2), e2 = d2.context || d2, g2 = e2 !== d2 && (e2.nodeType || e2 instanceof f) ? f(e2) : f.event, h2 = f.Deferred(), i2 = f.Callbacks("once memory"), j2 = d2.statusCode || {}, k2, l2 = {}, m2 = {}, n2, o2, p2, q2, r2, s2 = 0, t2, u2, v2 = {
          readyState: 0,
          setRequestHeader: function(a3, b2) {
            if (!s2) {
              var c3 = a3.toLowerCase();
              a3 = m2[c3] = m2[c3] || a3, l2[a3] = b2;
            }
            return this;
          },
          getAllResponseHeaders: function() {
            return s2 === 2 ? n2 : null;
          },
          getResponseHeader: function(a3) {
            var c3;
            if (s2 === 2) {
              if (!o2) {
                o2 = {};
                while (c3 = bJ.exec(n2))
                  o2[c3[1].toLowerCase()] = c3[2];
              }
              c3 = o2[a3.toLowerCase()];
            }
            return c3 === b ? null : c3;
          },
          overrideMimeType: function(a3) {
            s2 || (d2.mimeType = a3);
            return this;
          },
          abort: function(a3) {
            a3 = a3 || "abort", p2 && p2.abort(a3), w2(0, a3);
            return this;
          }
        };
        h2.promise(v2), v2.success = v2.done, v2.error = v2.fail, v2.complete = i2.add, v2.statusCode = function(a3) {
          if (a3) {
            var b2;
            if (s2 < 2)
              for (b2 in a3)
                j2[b2] = [j2[b2], a3[b2]];
            else
              b2 = a3[v2.status], v2.then(b2, b2);
          }
          return this;
        }, d2.url = ((a2 || d2.url) + "").replace(bI, "").replace(bN, bY[1] + "//"), d2.dataTypes = f.trim(d2.dataType || "*").toLowerCase().split(bR), d2.crossDomain == null && (r2 = bT.exec(d2.url.toLowerCase()), d2.crossDomain = !(!r2 || r2[1] == bY[1] && r2[2] == bY[2] && (r2[3] || (r2[1] === "http:" ? 80 : 443)) == (bY[3] || (bY[1] === "http:" ? 80 : 443)))), d2.data && d2.processData && typeof d2.data != "string" && (d2.data = f.param(d2.data, d2.traditional)), ca(bV, d2, c2, v2);
        if (s2 === 2)
          return false;
        t2 = d2.global, d2.type = d2.type.toUpperCase(), d2.hasContent = !bM.test(d2.type), t2 && f.active++ === 0 && f.event.trigger("ajaxStart");
        if (!d2.hasContent) {
          d2.data && (d2.url += (bO.test(d2.url) ? "&" : "?") + d2.data, delete d2.data), k2 = d2.url;
          if (d2.cache === false) {
            var x2 = f.now(), y2 = d2.url.replace(bS, "$1_=" + x2);
            d2.url = y2 + (y2 === d2.url ? (bO.test(d2.url) ? "&" : "?") + "_=" + x2 : "");
          }
        }
        (d2.data && d2.hasContent && d2.contentType !== false || c2.contentType) && v2.setRequestHeader("Content-Type", d2.contentType), d2.ifModified && (k2 = k2 || d2.url, f.lastModified[k2] && v2.setRequestHeader("If-Modified-Since", f.lastModified[k2]), f.etag[k2] && v2.setRequestHeader("If-None-Match", f.etag[k2])), v2.setRequestHeader(
          "Accept",
          d2.dataTypes[0] && d2.accepts[d2.dataTypes[0]] ? d2.accepts[d2.dataTypes[0]] + (d2.dataTypes[0] !== "*" ? ", " + bZ + "; q=0.01" : "") : d2.accepts["*"]
        );
        for (u2 in d2.headers)
          v2.setRequestHeader(u2, d2.headers[u2]);
        if (d2.beforeSend && (d2.beforeSend.call(e2, v2, d2) === false || s2 === 2)) {
          v2.abort();
          return false;
        }
        for (u2 in { success: 1, error: 1, complete: 1 })
          v2[u2](d2[u2]);
        p2 = ca(bW, d2, c2, v2);
        if (!p2)
          w2(-1, "No Transport");
        else {
          v2.readyState = 1, t2 && g2.trigger("ajaxSend", [v2, d2]), d2.async && d2.timeout > 0 && (q2 = setTimeout(function() {
            v2.abort("timeout");
          }, d2.timeout));
          try {
            s2 = 1, p2.send(l2, w2);
          } catch (z) {
            s2 < 2 ? w2(-1, z) : f.error(z);
          }
        }
        return v2;
      },
      param: function(a2, c2) {
        var d2 = [], e2 = function(a3, b2) {
          b2 = f.isFunction(b2) ? b2() : b2, d2[d2.length] = encodeURIComponent(a3) + "=" + encodeURIComponent(b2);
        };
        c2 === b && (c2 = f.ajaxSettings.traditional);
        if (f.isArray(a2) || a2.jquery && !f.isPlainObject(a2))
          f.each(a2, function() {
            e2(this.name, this.value);
          });
        else
          for (var g2 in a2)
            cc(g2, a2[g2], c2, e2);
        return d2.join("&").replace(bF, "+");
      }
    }), f.extend({ active: 0, lastModified: {}, etag: {} });
    var cf = f.now(), cg = /(\=)\?(&|$)|\?\?/i;
    f.ajaxSetup({
      jsonp: "callback",
      jsonpCallback: function() {
        return f.expando + "_" + cf++;
      }
    }), f.ajaxPrefilter("json jsonp", function(b2, c2, d2) {
      var e2 = b2.contentType === "application/x-www-form-urlencoded" && typeof b2.data == "string";
      if (b2.dataTypes[0] === "jsonp" || b2.jsonp !== false && (cg.test(b2.url) || e2 && cg.test(b2.data))) {
        var g2, h2 = b2.jsonpCallback = f.isFunction(b2.jsonpCallback) ? b2.jsonpCallback() : b2.jsonpCallback, i2 = a[h2], j2 = b2.url, k2 = b2.data, l2 = "$1" + h2 + "$2";
        b2.jsonp !== false && (j2 = j2.replace(cg, l2), b2.url === j2 && (e2 && (k2 = k2.replace(cg, l2)), b2.data === k2 && (j2 += (/\?/.test(j2) ? "&" : "?") + b2.jsonp + "=" + h2))), b2.url = j2, b2.data = k2, a[h2] = function(a2) {
          g2 = [a2];
        }, d2.always(function() {
          a[h2] = i2, g2 && f.isFunction(i2) && a[h2](g2[0]);
        }), b2.converters["script json"] = function() {
          g2 || f.error(h2 + " was not called");
          return g2[0];
        }, b2.dataTypes[0] = "json";
        return "script";
      }
    }), f.ajaxSetup({
      accepts: { script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript" },
      contents: { script: /javascript|ecmascript/ },
      converters: {
        "text script": function(a2) {
          f.globalEval(a2);
          return a2;
        }
      }
    }), f.ajaxPrefilter("script", function(a2) {
      a2.cache === b && (a2.cache = false), a2.crossDomain && (a2.type = "GET", a2.global = false);
    }), f.ajaxTransport("script", function(a2) {
      if (a2.crossDomain) {
        var d2, e2 = c.head || c.getElementsByTagName("head")[0] || c.documentElement;
        return {
          send: function(f2, g2) {
            d2 = c.createElement("script"), d2.async = "async", a2.scriptCharset && (d2.charset = a2.scriptCharset), d2.src = a2.url, d2.onload = d2.onreadystatechange = function(a3, c2) {
              if (c2 || !d2.readyState || /loaded|complete/.test(d2.readyState))
                d2.onload = d2.onreadystatechange = null, e2 && d2.parentNode && e2.removeChild(d2), d2 = b, c2 || g2(200, "success");
            }, e2.insertBefore(d2, e2.firstChild);
          },
          abort: function() {
            d2 && d2.onload(0, 1);
          }
        };
      }
    });
    var ch = a.ActiveXObject ? function() {
      for (var a2 in cj)
        cj[a2](0, 1);
    } : false, ci = 0, cj;
    f.ajaxSettings.xhr = a.ActiveXObject ? function() {
      return !this.isLocal && ck() || cl();
    } : ck, function(a2) {
      f.extend(f.support, { ajax: !!a2, cors: !!a2 && "withCredentials" in a2 });
    }(f.ajaxSettings.xhr()), f.support.ajax && f.ajaxTransport(function(c2) {
      if (!c2.crossDomain || f.support.cors) {
        var d2;
        return {
          send: function(e2, g2) {
            var h2 = c2.xhr(), i2, j2;
            c2.username ? h2.open(c2.type, c2.url, c2.async, c2.username, c2.password) : h2.open(c2.type, c2.url, c2.async);
            if (c2.xhrFields)
              for (j2 in c2.xhrFields)
                h2[j2] = c2.xhrFields[j2];
            c2.mimeType && h2.overrideMimeType && h2.overrideMimeType(c2.mimeType), !c2.crossDomain && !e2["X-Requested-With"] && (e2["X-Requested-With"] = "XMLHttpRequest");
            try {
              for (j2 in e2)
                h2.setRequestHeader(j2, e2[j2]);
            } catch (k2) {
            }
            h2.send(c2.hasContent && c2.data || null), d2 = function(a2, e3) {
              var j3, k2, l2, m2, n2;
              try {
                if (d2 && (e3 || h2.readyState === 4)) {
                  d2 = b, i2 && (h2.onreadystatechange = f.noop, ch && delete cj[i2]);
                  if (e3)
                    h2.readyState !== 4 && h2.abort();
                  else {
                    j3 = h2.status, l2 = h2.getAllResponseHeaders(), m2 = {}, n2 = h2.responseXML, n2 && n2.documentElement && (m2.xml = n2), m2.text = h2.responseText;
                    try {
                      k2 = h2.statusText;
                    } catch (o2) {
                      k2 = "";
                    }
                    !j3 && c2.isLocal && !c2.crossDomain ? j3 = m2.text ? 200 : 404 : j3 === 1223 && (j3 = 204);
                  }
                }
              } catch (p2) {
                e3 || g2(-1, p2);
              }
              m2 && g2(j3, k2, m2, l2);
            }, !c2.async || h2.readyState === 4 ? d2() : (i2 = ++ci, ch && (cj || (cj = {}, f(a).unload(ch)), cj[i2] = d2), h2.onreadystatechange = d2);
          },
          abort: function() {
            d2 && d2(0, 1);
          }
        };
      }
    });
    var cm = {}, cn, co, cp = /^(?:toggle|show|hide)$/, cq = /^([+\-]=)?([\d+.\-]+)([a-z%]*)$/i, cr, cs = [
      ["height", "marginTop", "marginBottom", "paddingTop", "paddingBottom"],
      ["width", "marginLeft", "marginRight", "paddingLeft", "paddingRight"],
      ["opacity"]
    ], ct;
    f.fn.extend({
      show: function(a2, b2, c2) {
        var d2, e2;
        if (a2 || a2 === 0)
          return this.animate(cw("show", 3), a2, b2, c2);
        for (var g2 = 0, h2 = this.length; g2 < h2; g2++)
          d2 = this[g2], d2.style && (e2 = d2.style.display, !f._data(d2, "olddisplay") && e2 === "none" && (e2 = d2.style.display = ""), e2 === "" && f.css(d2, "display") === "none" && f._data(d2, "olddisplay", cx(d2.nodeName)));
        for (g2 = 0; g2 < h2; g2++) {
          d2 = this[g2];
          if (d2.style) {
            e2 = d2.style.display;
            if (e2 === "" || e2 === "none")
              d2.style.display = f._data(d2, "olddisplay") || "";
          }
        }
        return this;
      },
      hide: function(a2, b2, c2) {
        if (a2 || a2 === 0)
          return this.animate(cw("hide", 3), a2, b2, c2);
        var d2, e2, g2 = 0, h2 = this.length;
        for (; g2 < h2; g2++)
          d2 = this[g2], d2.style && (e2 = f.css(d2, "display"), e2 !== "none" && !f._data(d2, "olddisplay") && f._data(d2, "olddisplay", e2));
        for (g2 = 0; g2 < h2; g2++)
          this[g2].style && (this[g2].style.display = "none");
        return this;
      },
      _toggle: f.fn.toggle,
      toggle: function(a2, b2, c2) {
        var d2 = typeof a2 == "boolean";
        f.isFunction(a2) && f.isFunction(b2) ? this._toggle.apply(this, arguments) : a2 == null || d2 ? this.each(function() {
          var b3 = d2 ? a2 : f(this).is(":hidden");
          f(this)[b3 ? "show" : "hide"]();
        }) : this.animate(cw("toggle", 3), a2, b2, c2);
        return this;
      },
      fadeTo: function(a2, b2, c2, d2) {
        return this.filter(":hidden").css("opacity", 0).show().end().animate({ opacity: b2 }, a2, c2, d2);
      },
      animate: function(a2, b2, c2, d2) {
        function g2() {
          e2.queue === false && f._mark(this);
          var b3 = f.extend({}, e2), c3 = this.nodeType === 1, d3 = c3 && f(this).is(":hidden"), g3, h2, i2, j2, k2, l2, m2, n2, o2;
          b3.animatedProperties = {};
          for (i2 in a2) {
            g3 = f.camelCase(i2), i2 !== g3 && (a2[g3] = a2[i2], delete a2[i2]), h2 = a2[g3], f.isArray(h2) ? (b3.animatedProperties[g3] = h2[1], h2 = a2[g3] = h2[0]) : b3.animatedProperties[g3] = b3.specialEasing && b3.specialEasing[g3] || b3.easing || "swing";
            if (h2 === "hide" && d3 || h2 === "show" && !d3)
              return b3.complete.call(this);
            c3 && (g3 === "height" || g3 === "width") && (b3.overflow = [this.style.overflow, this.style.overflowX, this.style.overflowY], f.css(this, "display") === "inline" && f.css(this, "float") === "none" && (!f.support.inlineBlockNeedsLayout || cx(this.nodeName) === "inline" ? this.style.display = "inline-block" : this.style.zoom = 1));
          }
          b3.overflow != null && (this.style.overflow = "hidden");
          for (i2 in a2)
            j2 = new f.fx(this, b3, i2), h2 = a2[i2], cp.test(h2) ? (o2 = f._data(this, "toggle" + i2) || (h2 === "toggle" ? d3 ? "show" : "hide" : 0), o2 ? (f._data(this, "toggle" + i2, o2 === "show" ? "hide" : "show"), j2[o2]()) : j2[h2]()) : (k2 = cq.exec(h2), l2 = j2.cur(), k2 ? (m2 = parseFloat(k2[2]), n2 = k2[3] || (f.cssNumber[i2] ? "" : "px"), n2 !== "px" && (f.style(this, i2, (m2 || 1) + n2), l2 = (m2 || 1) / j2.cur() * l2, f.style(this, i2, l2 + n2)), k2[1] && (m2 = (k2[1] === "-=" ? -1 : 1) * m2 + l2), j2.custom(l2, m2, n2)) : j2.custom(l2, h2, ""));
          return true;
        }
        var e2 = f.speed(b2, c2, d2);
        if (f.isEmptyObject(a2))
          return this.each(e2.complete, [false]);
        a2 = f.extend({}, a2);
        return e2.queue === false ? this.each(g2) : this.queue(e2.queue, g2);
      },
      stop: function(a2, c2, d2) {
        typeof a2 != "string" && (d2 = c2, c2 = a2, a2 = b), c2 && a2 !== false && this.queue(a2 || "fx", []);
        return this.each(function() {
          function h2(a3, b3, c4) {
            var e3 = b3[c4];
            f.removeData(a3, c4, true), e3.stop(d2);
          }
          var b2, c3 = false, e2 = f.timers, g2 = f._data(this);
          d2 || f._unmark(true, this);
          if (a2 == null)
            for (b2 in g2)
              g2[b2].stop && b2.indexOf(".run") === b2.length - 4 && h2(this, g2, b2);
          else
            g2[b2 = a2 + ".run"] && g2[b2].stop && h2(this, g2, b2);
          for (b2 = e2.length; b2--; )
            e2[b2].elem === this && (a2 == null || e2[b2].queue === a2) && (d2 ? e2[b2](true) : e2[b2].saveState(), c3 = true, e2.splice(b2, 1));
          (!d2 || !c3) && f.dequeue(this, a2);
        });
      }
    }), f.each(
      {
        slideDown: cw("show", 1),
        slideUp: cw("hide", 1),
        slideToggle: cw("toggle", 1),
        fadeIn: { opacity: "show" },
        fadeOut: { opacity: "hide" },
        fadeToggle: { opacity: "toggle" }
      },
      function(a2, b2) {
        f.fn[a2] = function(a3, c2, d2) {
          return this.animate(b2, a3, c2, d2);
        };
      }
    ), f.extend({
      speed: function(a2, b2, c2) {
        var d2 = a2 && typeof a2 == "object" ? f.extend({}, a2) : {
          complete: c2 || !c2 && b2 || f.isFunction(a2) && a2,
          duration: a2,
          easing: c2 && b2 || b2 && !f.isFunction(b2) && b2
        };
        d2.duration = f.fx.off ? 0 : typeof d2.duration == "number" ? d2.duration : d2.duration in f.fx.speeds ? f.fx.speeds[d2.duration] : f.fx.speeds._default;
        if (d2.queue == null || d2.queue === true)
          d2.queue = "fx";
        d2.old = d2.complete, d2.complete = function(a3) {
          f.isFunction(d2.old) && d2.old.call(this), d2.queue ? f.dequeue(this, d2.queue) : a3 !== false && f._unmark(this);
        };
        return d2;
      },
      easing: {
        linear: function(a2, b2, c2, d2) {
          return c2 + d2 * a2;
        },
        swing: function(a2, b2, c2, d2) {
          return (-Math.cos(a2 * Math.PI) / 2 + 0.5) * d2 + c2;
        }
      },
      timers: [],
      fx: function(a2, b2, c2) {
        this.options = b2, this.elem = a2, this.prop = c2, b2.orig = b2.orig || {};
      }
    }), f.fx.prototype = {
      update: function() {
        this.options.step && this.options.step.call(this.elem, this.now, this), (f.fx.step[this.prop] || f.fx.step._default)(this);
      },
      cur: function() {
        if (this.elem[this.prop] != null && (!this.elem.style || this.elem.style[this.prop] == null))
          return this.elem[this.prop];
        var a2, b2 = f.css(this.elem, this.prop);
        return isNaN(a2 = parseFloat(b2)) ? !b2 || b2 === "auto" ? 0 : b2 : a2;
      },
      custom: function(a2, c2, d2) {
        function h2(a3) {
          return e2.step(a3);
        }
        var e2 = this, g2 = f.fx;
        this.startTime = ct || cu(), this.end = c2, this.now = this.start = a2, this.pos = this.state = 0, this.unit = d2 || this.unit || (f.cssNumber[this.prop] ? "" : "px"), h2.queue = this.options.queue, h2.elem = this.elem, h2.saveState = function() {
          e2.options.hide && f._data(e2.elem, "fxshow" + e2.prop) === b && f._data(e2.elem, "fxshow" + e2.prop, e2.start);
        }, h2() && f.timers.push(h2) && !cr && (cr = setInterval(g2.tick, g2.interval));
      },
      show: function() {
        var a2 = f._data(this.elem, "fxshow" + this.prop);
        this.options.orig[this.prop] = a2 || f.style(this.elem, this.prop), this.options.show = true, a2 !== b ? this.custom(this.cur(), a2) : this.custom(this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur()), f(this.elem).show();
      },
      hide: function() {
        this.options.orig[this.prop] = f._data(this.elem, "fxshow" + this.prop) || f.style(this.elem, this.prop), this.options.hide = true, this.custom(this.cur(), 0);
      },
      step: function(a2) {
        var b2, c2, d2, e2 = ct || cu(), g2 = true, h2 = this.elem, i2 = this.options;
        if (a2 || e2 >= i2.duration + this.startTime) {
          this.now = this.end, this.pos = this.state = 1, this.update(), i2.animatedProperties[this.prop] = true;
          for (b2 in i2.animatedProperties)
            i2.animatedProperties[b2] !== true && (g2 = false);
          if (g2) {
            i2.overflow != null && !f.support.shrinkWrapBlocks && f.each(["", "X", "Y"], function(a3, b3) {
              h2.style["overflow" + b3] = i2.overflow[a3];
            }), i2.hide && f(h2).hide();
            if (i2.hide || i2.show)
              for (b2 in i2.animatedProperties)
                f.style(h2, b2, i2.orig[b2]), f.removeData(h2, "fxshow" + b2, true), f.removeData(h2, "toggle" + b2, true);
            d2 = i2.complete, d2 && (i2.complete = false, d2.call(h2));
          }
          return false;
        }
        i2.duration == Infinity ? this.now = e2 : (c2 = e2 - this.startTime, this.state = c2 / i2.duration, this.pos = f.easing[i2.animatedProperties[this.prop]](this.state, c2, 0, 1, i2.duration), this.now = this.start + (this.end - this.start) * this.pos), this.update();
        return true;
      }
    }, f.extend(f.fx, {
      tick: function() {
        var a2, b2 = f.timers, c2 = 0;
        for (; c2 < b2.length; c2++)
          a2 = b2[c2], !a2() && b2[c2] === a2 && b2.splice(c2--, 1);
        b2.length || f.fx.stop();
      },
      interval: 13,
      stop: function() {
        clearInterval(cr), cr = null;
      },
      speeds: { slow: 600, fast: 200, _default: 400 },
      step: {
        opacity: function(a2) {
          f.style(a2.elem, "opacity", a2.now);
        },
        _default: function(a2) {
          a2.elem.style && a2.elem.style[a2.prop] != null ? a2.elem.style[a2.prop] = a2.now + a2.unit : a2.elem[a2.prop] = a2.now;
        }
      }
    }), f.each(["width", "height"], function(a2, b2) {
      f.fx.step[b2] = function(a3) {
        f.style(a3.elem, b2, Math.max(0, a3.now));
      };
    }), f.expr && f.expr.filters && (f.expr.filters.animated = function(a2) {
      return f.grep(f.timers, function(b2) {
        return a2 === b2.elem;
      }).length;
    });
    var cy = /^t(?:able|d|h)$/i, cz = /^(?:body|html)$/i;
    "getBoundingClientRect" in c.documentElement ? f.fn.offset = function(a2) {
      var b2 = this[0], c2;
      if (a2)
        return this.each(function(b3) {
          f.offset.setOffset(this, a2, b3);
        });
      if (!b2 || !b2.ownerDocument)
        return null;
      if (b2 === b2.ownerDocument.body)
        return f.offset.bodyOffset(b2);
      try {
        c2 = b2.getBoundingClientRect();
      } catch (d2) {
      }
      var e2 = b2.ownerDocument, g2 = e2.documentElement;
      if (!c2 || !f.contains(g2, b2))
        return c2 ? { top: c2.top, left: c2.left } : { top: 0, left: 0 };
      var h2 = e2.body, i2 = cA(e2), j2 = g2.clientTop || h2.clientTop || 0, k2 = g2.clientLeft || h2.clientLeft || 0, l2 = i2.pageYOffset || f.support.boxModel && g2.scrollTop || h2.scrollTop, m2 = i2.pageXOffset || f.support.boxModel && g2.scrollLeft || h2.scrollLeft, n2 = c2.top + l2 - j2, o2 = c2.left + m2 - k2;
      return { top: n2, left: o2 };
    } : f.fn.offset = function(a2) {
      var b2 = this[0];
      if (a2)
        return this.each(function(b3) {
          f.offset.setOffset(this, a2, b3);
        });
      if (!b2 || !b2.ownerDocument)
        return null;
      if (b2 === b2.ownerDocument.body)
        return f.offset.bodyOffset(b2);
      var c2, d2 = b2.offsetParent, g2 = b2.ownerDocument, h2 = g2.documentElement, i2 = g2.body, j2 = g2.defaultView, k2 = j2 ? j2.getComputedStyle(b2, null) : b2.currentStyle, l2 = b2.offsetTop, m2 = b2.offsetLeft;
      while ((b2 = b2.parentNode) && b2 !== i2 && b2 !== h2) {
        if (f.support.fixedPosition && k2.position === "fixed")
          break;
        c2 = j2 ? j2.getComputedStyle(b2, null) : b2.currentStyle, l2 -= b2.scrollTop, m2 -= b2.scrollLeft, b2 === d2 && (l2 += b2.offsetTop, m2 += b2.offsetLeft, f.support.doesNotAddBorder && (!f.support.doesAddBorderForTableAndCells || !cy.test(b2.nodeName)) && (l2 += parseFloat(c2.borderTopWidth) || 0, m2 += parseFloat(c2.borderLeftWidth) || 0), d2 = b2.offsetParent), f.support.subtractsBorderForOverflowNotVisible && c2.overflow !== "visible" && (l2 += parseFloat(c2.borderTopWidth) || 0, m2 += parseFloat(c2.borderLeftWidth) || 0), k2 = c2;
      }
      if (k2.position === "relative" || k2.position === "static")
        l2 += i2.offsetTop, m2 += i2.offsetLeft;
      f.support.fixedPosition && k2.position === "fixed" && (l2 += Math.max(h2.scrollTop, i2.scrollTop), m2 += Math.max(h2.scrollLeft, i2.scrollLeft));
      return { top: l2, left: m2 };
    }, f.offset = {
      bodyOffset: function(a2) {
        var b2 = a2.offsetTop, c2 = a2.offsetLeft;
        f.support.doesNotIncludeMarginInBodyOffset && (b2 += parseFloat(f.css(a2, "marginTop")) || 0, c2 += parseFloat(f.css(a2, "marginLeft")) || 0);
        return { top: b2, left: c2 };
      },
      setOffset: function(a2, b2, c2) {
        var d2 = f.css(a2, "position");
        d2 === "static" && (a2.style.position = "relative");
        var e2 = f(a2), g2 = e2.offset(), h2 = f.css(a2, "top"), i2 = f.css(a2, "left"), j2 = (d2 === "absolute" || d2 === "fixed") && f.inArray("auto", [h2, i2]) > -1, k2 = {}, l2 = {}, m2, n2;
        j2 ? (l2 = e2.position(), m2 = l2.top, n2 = l2.left) : (m2 = parseFloat(h2) || 0, n2 = parseFloat(i2) || 0), f.isFunction(b2) && (b2 = b2.call(a2, c2, g2)), b2.top != null && (k2.top = b2.top - g2.top + m2), b2.left != null && (k2.left = b2.left - g2.left + n2), "using" in b2 ? b2.using.call(a2, k2) : e2.css(k2);
      }
    }, f.fn.extend({
      position: function() {
        if (!this[0])
          return null;
        var a2 = this[0], b2 = this.offsetParent(), c2 = this.offset(), d2 = cz.test(b2[0].nodeName) ? { top: 0, left: 0 } : b2.offset();
        c2.top -= parseFloat(f.css(a2, "marginTop")) || 0, c2.left -= parseFloat(f.css(a2, "marginLeft")) || 0, d2.top += parseFloat(f.css(b2[0], "borderTopWidth")) || 0, d2.left += parseFloat(f.css(b2[0], "borderLeftWidth")) || 0;
        return { top: c2.top - d2.top, left: c2.left - d2.left };
      },
      offsetParent: function() {
        return this.map(function() {
          var a2 = this.offsetParent || c.body;
          while (a2 && !cz.test(a2.nodeName) && f.css(a2, "position") === "static")
            a2 = a2.offsetParent;
          return a2;
        });
      }
    }), f.each(["Left", "Top"], function(a2, c2) {
      var d2 = "scroll" + c2;
      f.fn[d2] = function(c3) {
        var e2, g2;
        if (c3 === b) {
          e2 = this[0];
          if (!e2)
            return null;
          g2 = cA(e2);
          return g2 ? "pageXOffset" in g2 ? g2[a2 ? "pageYOffset" : "pageXOffset"] : f.support.boxModel && g2.document.documentElement[d2] || g2.document.body[d2] : e2[d2];
        }
        return this.each(function() {
          g2 = cA(this), g2 ? g2.scrollTo(a2 ? f(g2).scrollLeft() : c3, a2 ? c3 : f(g2).scrollTop()) : this[d2] = c3;
        });
      };
    }), f.each(["Height", "Width"], function(a2, c2) {
      var d2 = c2.toLowerCase();
      f.fn["inner" + c2] = function() {
        var a3 = this[0];
        return a3 ? a3.style ? parseFloat(f.css(a3, d2, "padding")) : this[d2]() : null;
      }, f.fn["outer" + c2] = function(a3) {
        var b2 = this[0];
        return b2 ? b2.style ? parseFloat(f.css(b2, d2, a3 ? "margin" : "border")) : this[d2]() : null;
      }, f.fn[d2] = function(a3) {
        var e2 = this[0];
        if (!e2)
          return a3 == null ? null : this;
        if (f.isFunction(a3))
          return this.each(function(b2) {
            var c3 = f(this);
            c3[d2](a3.call(this, b2, c3[d2]()));
          });
        if (f.isWindow(e2)) {
          var g2 = e2.document.documentElement["client" + c2], h2 = e2.document.body;
          return e2.document.compatMode === "CSS1Compat" && g2 || h2 && h2["client" + c2] || g2;
        }
        if (e2.nodeType === 9)
          return Math.max(
            e2.documentElement["client" + c2],
            e2.body["scroll" + c2],
            e2.documentElement["scroll" + c2],
            e2.body["offset" + c2],
            e2.documentElement["offset" + c2]
          );
        if (a3 === b) {
          var i2 = f.css(e2, d2), j2 = parseFloat(i2);
          return f.isNumeric(j2) ? j2 : i2;
        }
        return this.css(d2, typeof a3 == "string" ? a3 : a3 + "px");
      };
    }), a.jQuery = a.$ = f;
  })(window);
  !function($2) {
    var chop = /(\s*\S+|\s)$/, start2 = /^(\S*)/;
    $2.truncate = function(html, options) {
      return $2("<div></div>").append(html).truncate(options).html();
    }, $2.fn.truncate = function(options) {
      $2.isNumeric(options) && (options = { length: options });
      var o = $2.extend({}, $2.truncate.defaults, options);
      return this.each(function() {
        var self2 = $2(this);
        o.noBreaks && self2.find("br").replaceWith(" ");
        var text = self2.text(), excess = text.length - o.length;
        if (o.stripTags && self2.text(text), o.words && excess > 0) {
          var truncated = text.slice(0, o.length).replace(chop, "").length;
          excess = o.keepFirstWord && 0 === truncated ? text.length - start2.exec(text)[0].length - 1 : text.length - truncated - 1;
        }
        excess < 0 || !excess && !o.truncated || $2.each(self2.contents().get().reverse(), function(i, el) {
          var $el = $2(el), length = $el.text().length;
          return length <= excess ? (o.truncated = true, excess -= length, void $el.remove()) : 3 === el.nodeType ? (o.finishBlock ? $2(el.splitText(length)).replaceWith(o.ellipsis) : $2(el.splitText(length - excess - 1)).replaceWith(o.ellipsis), false) : ($el.truncate($2.extend(o, { length: length - excess })), false);
        });
      });
    }, $2.truncate.defaults = {
      stripTags: false,
      words: false,
      keepFirstWord: false,
      noBreaks: false,
      finishBlock: false,
      length: 1 / 0,
      ellipsis: "\u2026"
    };
  }(jQuery);
  function scrollSpy(menuSelector, options) {
    var menu = $(menuSelector);
    if (!menu)
      return;
    options = options || {};
    var offset = options.offset || 0;
    var activeClassName = options.activeClassName || "active";
    var scollTarget = $(".content :header").find("a.headerlink"), lastId = null, active = $();
    $(window).scroll(function() {
      var fromTop = $(this).scrollTop() + offset;
      var id = scollTarget.filter(function() {
        return $(this).offset().top < fromTop;
      }).last().parent().attr("id") || "";
      if (lastId !== id) {
        active.removeClass(activeClassName);
        var newActive = [];
        for (var target = menu.find('[href="#' + id + '"],[href="#' + encodeURIComponent(id) + '"]'); target.length && !target.is(menu); target = target.parent()) {
          if (target.is("li"))
            newActive.push(target[0]);
        }
        active = $(newActive).addClass(activeClassName).trigger("scrollspy");
        lastId = id;
      }
    });
  }
  function utiliseBgColor() {
    setTimeout(function() {
      if ($("#single").length) {
        $("html").css("background", "#fff");
      } else {
        $("html").css("background", "#100e17");
      }
    }, 500);
  }
  function buildImgCaption() {
    var images = $(".content").find("img");
    var usedCaption = [];
    images.each(function() {
      var caption = $(this).attr("alt");
      if (caption !== "" && usedCaption.indexOf(caption) < 0) {
        $(".content").find("[alt='" + caption + "']").parent().append('<p class="image-caption">"' + caption + '"</p>');
        usedCaption.push(caption);
      }
    });
  }
  var Home = location.href, Pages = 4, xhr, xhrUrl = "";
  var Obsidian = {
    L: function(url, f, err) {
      if (url == xhrUrl) {
        return false;
      }
      xhrUrl = url;
      if (xhr) {
        xhr.abort();
      }
      xhr = $.ajax({
        type: "GET",
        url,
        timeout: 1e4,
        success: function(data2) {
          f(data2);
          xhrUrl = "";
        },
        error: function(a, b, c) {
          if (b == "abort") {
            err && err();
          } else {
            window.location.href = url;
          }
          xhrUrl = "";
        }
      });
    },
    P: function() {
      return !!("ontouchstart" in window);
    },
    PS: function() {
      if (!(window.history && history.pushState)) {
        return;
      }
      history.replaceState(
        {
          u: Home,
          t: document.title
        },
        document.title,
        Home
      );
      window.addEventListener("popstate", function(e) {
        var state = e.state;
        if (!state)
          return;
        document.title = state.t;
        if (state.u == Home) {
          $("#preview").css("position", "fixed");
          setTimeout(function() {
            $("#preview").removeClass("show");
            $("#container").show();
            window.scrollTo(0, parseInt($("#container").data("scroll")));
            setTimeout(function() {
              $("#preview").html("");
              $(window).trigger("resize");
            }, 300);
          }, 0);
        } else {
          Obsidian.loading();
          Obsidian.L(state.u, function(data2) {
            document.title = state.t;
            $("#preview").html($(data2).filter("#single"));
            Obsidian.preview();
            setTimeout(function() {
              Obsidian.player();
            }, 0);
          });
        }
      });
    },
    HS: function(tag, flag) {
      var id = tag.data("id") || 0, url = tag.attr("href"), title = "\u6587\u7AE0\u8BE6\u60C5\u9875";
      if (!$("#preview").length || !(window.history && history.pushState))
        location.href = url;
      Obsidian.loading();
      var state = {
        d: id,
        u: url
      };
      Obsidian.L(url, function(data2) {
        if (!$(data2).filter("#single").length) {
          location.href = url;
          return;
        }
        const tempDocument = new DOMParser().parseFromString(data2, "text/html");
        const singleElement = tempDocument.getElementById("single");
        switch (flag) {
          case "push":
            history.pushState(state, title, url);
            break;
          case "replace":
            history.replaceState(state, title, url);
            break;
        }
        document.title = title;
        const loadedScripts = [];
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          if (type === "DOMContentLoaded") {
            if (listener) {
              loadedScripts.push(listener);
            }
          }
          originalAddEventListener.call(this, type, listener, options);
        };
        $("#preview").html(singleElement);
        loadedScripts.forEach((script) => {
          script();
        });
        switch (flag) {
          case "push":
            Obsidian.preview();
            break;
          case "replace":
            Obsidian.initArticleJs();
            window.scrollTo(0, 0);
            Obsidian.loaded();
            break;
        }
        setTimeout(function() {
          Obsidian.player();
          $("#top").show();
        }, 0);
      });
    },
    preview: function() {
      $("#preview").one("transitionend webkitTransitionEnd oTransitionEnd otransitionend MSTransitionEnd", function() {
        var previewVisible = $("#preview").hasClass("show");
        if (!!previewVisible) {
          $("#container").hide();
        } else {
          $("#container").show();
        }
        Obsidian.loaded();
      });
      setTimeout(function() {
        $("#preview").addClass("show");
        $("#container").data("scroll", window.scrollY);
        setTimeout(function() {
          $("body").removeClass("fixed");
          $("#preview").css({
            position: "static"
          });
          Obsidian.initArticleJs();
        }, 500);
      }, 0);
    },
    player: function() {
      var p = $("#audio");
      if (!p.length) {
        $(".icon-play").css({
          color: "#dedede",
          cursor: "not-allowed"
        });
        return;
      }
      var sourceSrc = $("#audio source").eq(0).attr("src");
      if (sourceSrc == "" && p[0].src == "") {
        audiolist = $("#audio-list li");
        mp3 = audiolist.eq([Math.floor(Math.random() * audiolist.length)]);
        p[0].src = mp3.data("url");
      }
      if (p.eq(0).data("autoplay") == true) {
        p[0].play();
      }
      p.on({
        timeupdate: function() {
          var progress = p[0].currentTime / p[0].duration * 100;
          $(".bar").css("width", progress + "%");
          if (progress / 5 <= 1) {
            p[0].volume = progress / 5;
          } else {
            p[0].volume = 1;
          }
        },
        ended: function() {
          $(".icon-pause").removeClass("icon-pause").addClass("icon-play");
        },
        playing: function() {
          $(".icon-play").removeClass("icon-play").addClass("icon-pause");
        }
      });
    },
    loading: function() {
      var w = window.innerWidth;
      var css = '<style class="loaderstyle" id="loaderstyle' + w + '">@-moz-keyframes loader' + w + "{100%{background-position:" + w + "px 0}}@-webkit-keyframes loader" + w + "{100%{background-position:" + w + "px 0}}.loader" + w + "{-webkit-animation:loader" + w + " 3s linear infinite;-moz-animation:loader" + w + " 3s linear infinite;}</style>";
      $(".loaderstyle").remove();
      $("head").append(css);
      $("#loader").removeClass().addClass("loader" + w).show();
    },
    loaded: function() {
      $("#loader").removeClass().hide();
    },
    F: function(id, w, h) {
      var _height = $(id).parent().height(), _width = $(id).parent().width(), ratio = h / w;
      if (_height / _width > ratio) {
        id.style.height = _height + "px";
        id.style.width = _height / ratio + "px";
      } else {
        id.style.width = _width + "px";
        id.style.height = _width * ratio + "px";
      }
      id.style.left = (_width - parseInt(id.style.width)) / 2 + "px";
      id.style.top = (_height - parseInt(id.style.height)) / 2 + "px";
    },
    initArticleJs: function() {
      Obsidian.tocSpy(200);
      buildImgCaption();
      utiliseBgColor();
    },
    setCodeRowWithLang: function() {
      var code = $("code");
      if (code && code.length) {
        code.each(function() {
          var item = $(this), lang = "";
          if (item[0].className.indexOf(" ") > -1) {
            lang = item[0].className.split(" ")[0];
          } else {
            lang = item[0].className;
          }
          var langMap = {
            html: "HTML",
            xml: "XML",
            svg: "SVG",
            mathml: "MathML",
            css: "CSS",
            clike: "C-like",
            js: "JavaScript",
            abap: "ABAP",
            apacheconf: "Apache Configuration",
            apl: "APL",
            arff: "ARFF",
            asciidoc: "AsciiDoc",
            adoc: "AsciiDoc",
            asm6502: "6502 Assembly",
            aspnet: "ASP.NET (C#)",
            autohotkey: "AutoHotkey",
            autoit: "AutoIt",
            shell: "BASH",
            bash: "BASH",
            basic: "BASIC",
            csharp: "C#",
            dotnet: "C#",
            cpp: "C++",
            cil: "CIL",
            csp: "Content-Security-Policy",
            "css-extras": "CSS Extras",
            django: "Django/Jinja2",
            jinja2: "Django/Jinja2",
            dockerfile: "Docker",
            erb: "ERB",
            fsharp: "F#",
            gcode: "G-code",
            gedcom: "GEDCOM",
            glsl: "GLSL",
            gml: "GameMaker Language",
            gamemakerlanguage: "GameMaker Language",
            graphql: "GraphQL",
            hcl: "HCL",
            http: "HTTP",
            hpkp: "HTTP Public-Key-Pins",
            hsts: "HTTP Strict-Transport-Security",
            ichigojam: "IchigoJam",
            inform7: "Inform 7",
            javastacktrace: "Java stack trace",
            json: "JSON",
            jsonp: "JSONP",
            latex: "LaTeX",
            emacs: "Lisp",
            elisp: "Lisp",
            "emacs-lisp": "Lisp",
            lolcode: "LOLCODE",
            "markup-templating": "Markup templating",
            matlab: "MATLAB",
            mel: "MEL",
            n1ql: "N1QL",
            n4js: "N4JS",
            n4jsd: "N4JS",
            "nand2tetris-hdl": "Nand To Tetris HDL",
            nasm: "NASM",
            nginx: "nginx",
            nsis: "NSIS",
            objectivec: "Objective-C",
            ocaml: "OCaml",
            opencl: "OpenCL",
            parigp: "PARI/GP",
            objectpascal: "Object Pascal",
            php: "PHP",
            "php-extras": "PHP Extras",
            plsql: "PL/SQL",
            powershell: "PowerShell",
            properties: ".properties",
            protobuf: "Protocol Buffers",
            q: "Q (kdb+ database)",
            jsx: "React JSX",
            tsx: "React TSX",
            renpy: "Ren'py",
            rest: "reST (reStructuredText)",
            sas: "SAS",
            sass: "SASS (Sass)",
            scss: "SASS (Scss)",
            sql: "SQL",
            soy: "Soy (Closure Template)",
            tap: "TAP",
            toml: "TOML",
            tt2: "Template Toolkit 2",
            ts: "TypeScript",
            vbnet: "VB.Net",
            vhdl: "VHDL",
            vim: "vim",
            "visual-basic": "Visual Basic",
            vb: "Visual Basic",
            wasm: "WebAssembly",
            wiki: "Wiki markup",
            xeoracube: "XeoraCube",
            xojo: "Xojo (REALbasic)",
            xquery: "XQuery",
            yaml: "YAML"
          };
          var displayLangText = "";
          if (lang in langMap)
            displayLangText = langMap[lang];
          else
            displayLangText = lang;
          if (item.find(".language-mark").length <= 0 && displayLangText) {
            item.css("background", "transparent");
            item.css("padding", 0);
            item.text();
            item.empty();
          }
        });
      }
    },
    tocSpy: function(offset) {
      var tocContainer = $("#toc");
      var toc = tocContainer, tocHeight = toc.height();
      scrollSpy(tocContainer, {
        offset: 200
      });
      $(".toc-item").on("scrollspy", function() {
        var tocTop = toc.scrollTop(), link = $(this).children(".toc-link"), thisTop = link.position().top;
        if ($(this).height() != link.height())
          return;
        if (thisTop <= 0)
          toc.scrollTop(tocTop + thisTop);
        else if (tocHeight <= thisTop)
          toc.scrollTop(tocTop + thisTop + link.outerHeight() - tocHeight);
      });
    },
    reactToWindowHeight: function() {
      var postSpacing = 315;
      var winHeight = $(window).height();
      var winWidth = $(window).width();
      var firstPostHeight = $("#post0").height();
      if (winWidth <= 900) {
        postSpacing = 100;
      }
      if (firstPostHeight + postSpacing > winHeight || winWidth <= 900) {
        $("#mark").css("height", firstPostHeight + postSpacing + "px");
        $("#screen").css("height", firstPostHeight + postSpacing + "px");
      }
    },
    initialShare: function() {
    },
    v: function(t, e) {
      if (t)
        switch (t) {
          case "javascript":
          case "text/javascript":
          case "js":
            return t = "javascript";
          case "json":
            return e ? t : t = {
              name: "javascript",
              json: true
            };
          case "jsonld":
          case "json-ld":
            return e ? t : "application/ld+json";
          case "text/typescript":
          case "typescript":
          case "ts":
            return e ? "typescript" : t = {
              name: "javascript",
              typescript: true
            };
          case "clojure":
            return t;
          case "coffee":
          case "coffeescript":
          case "css":
            return t;
          case "less":
            return e ? "less" : "text/x-less";
          case "scss":
            return e ? "scss" : t = "text/x-scss";
          case "gfm":
          case "github flavored markdown":
            return t = "gfm";
          case "markdown":
          case "md":
          case "mkd":
            return t;
          case "xml":
          case "xaml":
          case "mjml":
          case "xul":
          case "enml":
            return e ? t : "xml";
          case "haskell":
            return t;
          case "htmlmixed":
          case "html":
          case "xhtml":
          case "svg":
          case "epub":
            return e ? /^html/.exec(t) ? "html" : t : t = "htmlmixed";
          case "lua":
            return t;
          case "lisp":
          case "commonlisp":
          case "common lisp":
            return t = "commonlisp";
          case "pascal":
            return t;
          case "perl":
          case "perl5":
          case "perl4":
          case "perl3":
          case "perl2":
            return "perl";
          case "perl6":
            return t;
          case "php+html":
            return e ? "php" : "application/x-httpd-php";
          case "php":
          case "php3":
          case "php4":
          case "php5":
          case "php6":
            return e ? t : "text/x-php";
          case "cython":
            return e ? t : t = "text/x-cython";
          case "python":
            return e ? t : t = "text/x-python";
          case "ruby":
            return t;
          case "shell":
          case "sh":
          case "zsh":
          case "bash":
            return t = "shell";
          case "sql":
          case "sql lite":
          case "sqlite":
            return e ? t : t = "text/x-sql";
          case "mssql":
            return e ? t : t = "text/x-mssql";
          case "mysql":
            return e ? t : t = "text/x-mysql";
          case "mariadb":
            return e ? t : t = "text/x-mariadb";
          case "cassandra":
          case "cql":
            return e ? t : t = "text/x-cassandra";
          case "plsql":
            return e ? t : t = "text/x-plsql";
          case "stex":
          case "tex":
          case "latex":
            return e ? t : "text/x-stex";
          case "tiddlywiki":
          case "wiki":
            return e ? t : t = "tiddlywiki";
          case "vb":
          case "visual basic":
          case "visualbasic":
          case "basic":
            return e ? t : t = "vb";
          case "vbscript":
          case "velocity":
            return t;
          case "verilog":
            return e ? t : t = "text/x-verilog";
          case "xquery":
            return t;
          case "yaml":
          case "yml":
            return e ? t : "yaml";
          case "go":
          case "groovy":
          case "nginx":
            return t;
          case "octave":
          case "matlab":
            return e ? t : "text/x-octave";
          case "c":
          case "clike":
          case "csrc":
            return e ? t : t = "text/x-csrc";
          case "c++":
          case "c++src":
          case "cpp":
          case "cc":
          case "hpp":
          case "h++":
          case "h":
            return e ? t : t = "text/x-c++src";
          case "obj-c":
          case "objc":
          case "objective c":
          case "objective-c":
          case "objectivec":
            return e ? t : t = "text/x-objectivec";
          case "text/x-scala":
          case "scala":
            return e ? t : t = "text/x-scala";
          case "csharp":
          case "c#":
          case "cs":
            return e ? t : t = "text/x-csharp";
          case "java":
            return e ? t : t = "text/x-java";
          case "squirrel":
            return e ? t : t = "text/x-squirrel";
          case "ceylon":
            return e ? t : t = "text/x-ceylon";
          case "kotlin":
            return e ? t : t = "text/x-kotlin";
          case "swift":
            return t = "swift";
          case "r":
          case "rlang":
          case "r-lang":
            return e ? t : t = "text/x-rsrc";
          case "d":
          case "diff":
          case "erlang":
          case "http":
          case "jade":
            return t;
          case "rst":
          case "restructuredtext":
            return t = "rst";
          case "rust":
          case "jinja2":
            return t;
          case "aspx":
          case "asp":
          case "asp.net":
            return e ? t : t = "application/x-aspx";
          case "jsp":
            return e ? t : t = "application/x-jsp";
          case "erb":
            return e ? t : t = "application/x-erb";
          case "ejs":
          case "embeddedjs":
          case "embedded javaScript":
            return e ? t : t = "application/x-ejs";
          case "powershell":
          case "bat":
          case "cmd":
            return e ? t : "application/x-powershell";
          case "dockerfile":
            return e ? t : "text/x-dockerfile";
          case "jsx":
          case "react":
            return e ? t : "text/jsx";
          case "tsx":
            return e ? t : "text/typescript-jsx";
          case "vue.js":
          case "vue":
          case "vue-template":
            return e ? t : "script/x-vue";
          case "nsis":
            return e ? t : "text/x-nsis";
          case "mathematica":
            return e ? t : "text/x-mathematica";
          case "tiki":
          case "tiki wiki":
          case "tiki-wiki":
          case "tikiwiki":
            return "tiki";
          case "properties":
          case "ini":
            return e ? t : "text/x-properties";
          case "livescript":
            return e ? t : "text/x-livescript";
          case "asm":
          case "assembly":
          case "nasm":
          case "gas":
            return e ? t : "assembly";
          case "toml":
            return e ? t : "text/x-toml";
          case "sequence":
            return "sequence";
          case "flow":
          case "flowchart":
            return "flow";
          case "mermaid":
            return "mermaid";
          case "ocaml":
            return e ? t : "text/x-ocaml";
          case "f#":
          case "fsharp":
            return e ? t : "text/x-fsharp";
          case "elm":
            return e ? t : "text/x-elm";
          case "pgp":
          case "pgp-keys":
          case "pgp-key":
          case "pgp-signature":
          case "asciiarmor":
          case "ascii-armor":
          case "ascii armor":
            return e ? t : "application/pgp";
          case "spreadsheet":
          case "excel":
            return e ? t : "text/x-spreadsheet";
          case "elixir":
            return "elixir";
          case "cmake":
            return e ? t : "text/x-cmake";
          case "cypher":
          case "cypher-query":
            return e ? t : "application/x-cypher-query";
          case "dart":
            return "dart";
          case "django":
            return e ? t : "text/x-django";
          case "dtd":
          case "xml-dtd":
          case "xml dtd":
          case "xmldtd":
            return e ? t : "application/xml-dtd";
          case "dylan":
            return e ? t : "text/x-dylan";
          case "handlebars":
            return e ? t : "text/x-handlebars-template";
          case "idl":
            return e ? t : "text/x-idl";
          case "webidl":
          case "web-idl":
          case "web idl":
            return e ? t : "text/x-webidl";
          case "yacas":
            return e ? t : "text/x-yacas";
          case "mbox":
            return e ? t : "application/mbox";
          case "vhdl":
            return e ? t : "text/x-vhdl";
          case "julia":
            return "julia";
          case "haxe":
            return e ? t : "text/x-haxe";
          case "hxml":
            return e ? t : "text/x-hxml";
          case "fortran":
            return e ? t : "text/x-fortran";
          case "protobuf":
            return e ? t : "text/x-protobuf";
          case "makefile":
            return e ? t : "text/x-makefile";
          case "tcl":
            return e ? t : "text/x-tcl";
          case "scheme":
            return e ? t : "text/x-scheme";
          case "twig":
            return e ? t : "text/x-twig";
          case "sas":
            return e ? t : "text/x-sas";
          case "pseudocode":
            return e ? t : "text/x-pseudocode";
          case "julia":
          case "text/x-julia":
          case "stylus":
          case "cobol":
          case "oz":
          case "sparql":
          case "crystal":
            return t;
          case "asn.1":
            return e ? "ASN.1" : t = "text/x-ttcn-asn";
          case "gherkin":
          case "smalltalk":
          case "turtle":
            return t;
          default:
            return "";
        }
    },
    loadingOut: function() {
      setTimeout(function() {
        $("html, body").removeClass("loading");
        setTimeout(function() {
          $(".loader").css("z-index", "-1");
        }, 600);
      }, 500);
    }
  };
  $(function() {
    var inputArea = document.querySelector("#local-search-input");
    if (inputArea) {
      inputArea.onclick = function() {
        getSearchFile();
        this.onclick = null;
      };
      inputArea.onkeydown = function() {
        if (event.keyCode == 13)
          return false;
      };
    }
    if ($("#post0").length) {
      Obsidian.reactToWindowHeight();
    }
    if (Obsidian.P()) {
      $("body").addClass("touch");
    }
    if ($("#preview").length) {
      Obsidian.PS();
      $(".pview a").addClass("pviewa");
      Obsidian.loadingOut();
    } else {
      $("#single").css("min-height", window.innerHeight);
      Obsidian.loadingOut();
      window.addEventListener("popstate", function(e) {
        if (e.state)
          location.href = e.state.u;
      });
      Obsidian.player();
      $(".icon-icon, .image-icon").attr("href", "/");
      $("#top").show();
    }
    (() => {
      var refOffset = 0, articleRefOffset = 0, articleMenuHeight = 51, menuHeight = 70, header = document.querySelector("#header"), logoImg = document.querySelector(".logo > img");
      var handler4 = () => {
        var newOffset = window.scrollY || window.pageYOffset;
        if ($("#header").length && !$(".scrollbar").length) {
          if (newOffset > menuHeight) {
            if (newOffset > refOffset) {
              header.classList.remove("animateIn");
              header.classList.add("animateOut");
            } else {
              header.classList.remove("animateOut");
              header.classList.add("animateIn");
            }
            header.style.paddingTop = "20px";
            header.style.background = "rgba(16,14,23,1)";
            header.style.borderBottom = "1px solid #201c29";
            header.style.boxShadow = "0 0 30px rgba(0, 0, 0, 1)";
            refOffset = newOffset;
          } else {
            if ($(window).width() <= 780) {
              header.style.paddingTop = "30px";
            } else {
              header.style.paddingTop = "70px";
            }
            header.style.background = "transparent";
            header.style.borderBottom = "0px";
            header.style.boxShadow = "none";
            if (!logoImg.classList.contains("spin")) {
              logoImg.classList.add("spin");
              setTimeout(function() {
                logoImg.classList.remove("spin");
              }, 2e3);
            }
          }
        }
        var topHeader = document.querySelector("#top");
        var homeIcon = document.querySelector("#home-icon");
        if (topHeader && $(".scrollbar").length && !$(".icon-images").hasClass("active")) {
          if (newOffset > articleMenuHeight) {
            if (newOffset > articleRefOffset) {
              topHeader.classList.remove("animateIn");
              topHeader.classList.add("animateOut");
              $(".subtitle").fadeOut();
            } else {
              topHeader.classList.remove("animateOut");
              topHeader.classList.add("animateIn");
              $(".subtitle").fadeIn();
            }
            articleRefOffset = newOffset;
          } else {
            $(".subtitle").fadeOut();
            if (!homeIcon.classList.contains("spin")) {
              homeIcon.classList.add("spin");
              setTimeout(function() {
                homeIcon.classList.remove("spin");
              }, 2e3);
            }
          }
          var wt = $(window).scrollTop(), tw = $("#top").width(), dh = document.body.scrollHeight, wh = $(window).height();
          var width = tw / (dh - wh) * wt;
          $(".scrollbar").width(width);
        }
        var scrollTop = $(window).scrollTop(), docHeight = $(document).height(), winHeight = $(window).height(), winWidth = $(window).width(), scrollPercent = scrollTop / (docHeight - winHeight), scrollPercentRounded = Math.round(scrollPercent * 100), backToTopState = $("#back-to-top").css("display");
        $("#back-to-top").find(".percentage").html(scrollPercentRounded + "%");
        $("#back-to-top").find(".flow").css("height", scrollPercentRounded + "%");
        if (winWidth >= 920) {
          if (scrollPercentRounded > 10) {
            if (backToTopState === "none") {
              $("#back-to-top").removeClass("fadeOutRight");
              $("#back-to-top").addClass("fadeInRight");
              $("#back-to-top").css("display", "block");
            }
          } else {
            if (backToTopState === "block") {
              setTimeout(function() {
                $("#back-to-top").css("display", "none");
              }, 400);
              $("#back-to-top").removeClass("fadeInRight");
              $("#back-to-top").addClass("fadeOutRight");
            }
          }
        }
      };
      window.addEventListener("scroll", handler4, false);
    })($);
    $(window).on("touchmove", function(e) {
      if ($("body").hasClass("mu")) {
        e.preventDefault();
      }
    });
    $("body").on("click", function(e) {
      var tag = $(e.target).attr("class") || "", rel = $(e.target).attr("rel") || "", set3, clone2;
      if (e.target.nodeName == "IMG" && $(e.target).parents("div.content").length > 0) {
        tag = "pimg";
      }
      if (!tag && !rel)
        return;
      switch (true) {
        case tag.indexOf("share") != -1:
          var shareComponent = $(".share-component-cc");
          if (shareComponent.css("opacity") != "1") {
            $(".share-component-cc").css("opacity", 1);
          } else {
            $(".share-component-cc").css("opacity", 0);
          }
          break;
        case tag.indexOf("icon-top02") != -1:
          $("html,body").animate(
            {
              scrollTop: 0
            },
            300
          );
          break;
        case tag.indexOf("switchmenu") != -1:
          window.scrollTo(0, 0);
          $("html, body").toggleClass("mu");
          var switchMenu = $(".switchmenu");
          if (switchMenu.hasClass("icon-menu")) {
            switchMenu.removeClass("icon-menu").addClass("icon-cross");
          } else {
            switchMenu.removeClass("icon-cross").addClass("icon-menu");
          }
          return false;
        case tag.indexOf("more") != -1:
          tag = $(".more");
          if (tag.data("status") == "loading") {
            return false;
          }
          var num = parseInt(tag.data("page")) || 1;
          if (num == 1) {
            tag.data("page", 1);
          }
          if (num >= Pages) {
            return;
          }
          tag.html(tag.attr("data-loading")).data("status", "loading");
          Obsidian.loading();
          Obsidian.L(
            tag.attr("href"),
            function(data2) {
              var link = $(data2).find(".more").attr("href");
              if (link != void 0) {
                tag.attr("href", link).html(tag.attr("data-load-more")).data("status", "loaded");
                tag.data("page", parseInt(tag.data("page")) + 1);
              } else {
                $("#pager").remove();
              }
              var tempScrollTop = $(window).scrollTop();
              $("#primary").append($(data2).find(".post"));
              $(window).scrollTop(tempScrollTop + 100);
              Obsidian.loaded();
              $("html,body").animate(
                {
                  scrollTop: tempScrollTop + 400
                },
                500
              );
              document.querySelectorAll("pre code").forEach((block) => {
                if (typeof hljs !== "undefined")
                  hljs.highlightBlock(block);
              });
              Obsidian.setCodeRowWithLang();
            },
            function() {
              tag.html(tag.attr("data-load-more")).data("status", "loaded");
            }
          );
          return false;
        case tag.indexOf("icon-home") != -1:
          $(".toc").fadeOut(100);
          if ($("#preview").hasClass("show")) {
            history.back();
          } else {
            location.href = $(".icon-home").data("url");
          }
          return false;
        case tag.indexOf("p-href") != -1:
          $(".toc").fadeOut(100);
          location.href = $(".p-href").attr("href");
          return false;
        case tag.indexOf("icon-QRcode-o") != -1:
          if ($(".icon-scan").hasClass("tg")) {
            $("#qr").toggle();
          } else {
            $(".icon-scan").addClass("tg");
            $("#qr").qrcode({
              width: 128,
              height: 128,
              text: location.href
            }).toggle();
          }
          return false;
        case tag.indexOf("icon-play") != -1:
          $("#audio")[0].play();
          $(".icon-play").removeClass("icon-play").addClass("icon-pause");
          return false;
        case tag.indexOf("icon-pause") != -1:
          $("#audio")[0].pause();
          $(".icon-pause").removeClass("icon-pause").addClass("icon-play");
          return false;
        case tag.indexOf("posttitle") != -1:
          $("body").removeClass("fixed");
          Obsidian.HS($(e.target), "push");
          return false;
        case tag.indexOf("menu-link") != -1:
          $("body").removeClass("fixed");
          Obsidian.HS($(e.target), "push");
          return false;
        case (rel == "prev" || rel == "next"):
          var t;
          if (rel == "prev") {
            t = $("#prev_next a")[0].text;
          } else {
            t = $("#prev_next a")[1].text;
          }
          $(e.target).attr("title", t);
          Obsidian.HS($(e.target), "replace");
          return false;
        case (tag.indexOf("toc-text") != -1 || tag.indexOf("toc-link") != -1 || tag.indexOf("toc-number") != -1):
          hash = "";
          if (e.target.nodeName == "SPAN") {
            hash = $(e.target).parent().attr("href");
          } else {
            hash = $(e.target).attr("href");
          }
          to = $(".content :header").find('[href="' + hash + '"],[href="' + decodeURIComponent(hash) + '"]');
          $("html,body").animate(
            {
              scrollTop: to.offset().top - 80
            },
            300
          );
          return false;
        case tag.indexOf("pviewa") != -1:
          $("body").removeClass("mu");
          setTimeout(function() {
            Obsidian.HS($(e.target), "push");
            $(".toc").fadeIn(1e3);
          }, 300);
          return false;
        case tag.indexOf("pimg") != -1:
          var pswpElement = $(".pswp").get(0);
          if (pswpElement) {
            var items = [];
            var index2 = 0;
            var imgs = [];
            $(".content img").each(function(i, v) {
              if (e.target.src == v.src) {
                index2 = i;
              }
              var item = {
                src: v.src,
                w: v.naturalWidth,
                h: v.naturalHeight
              };
              imgs.push(v);
              items.push(item);
            });
            var options = {
              index: index2,
              shareEl: false,
              zoomEl: false,
              allowRotationOnUserZoom: true,
              history: false,
              getThumbBoundsFn: function(index3) {
                var thumbnail = imgs[index3], pageYScroll = window.pageYOffset || document.documentElement.scrollTop, rect = thumbnail.getBoundingClientRect();
                return {
                  x: rect.left,
                  y: rect.top + pageYScroll,
                  w: rect.width
                };
              }
            };
            var lightBox = new PhotoSwipe(pswpElement, PhotoSwipeUI_Default, items, options);
            lightBox.init();
          }
          return false;
        case tag.indexOf("category-list-child") != -1:
          tag = $(e.target);
          set3 = $(".set");
          clone2 = $(".clone-element");
          var categoryMask = $(".category-mask"), categoryDisplay = categoryMask.css("display"), setHeight = set3.height();
          if (categoryDisplay == "none") {
            tag.parent(".category-list-item").addClass("active");
            tag.find(".category-list-item").each(function() {
              $(this).addClass("sub-active");
            });
            clone2.append(set3.html()).show();
            clone2.css("top", set3.offset().top);
            clone2.css("left", set3.offset().left);
            set3.empty().css("height", setHeight + "px");
            $(".category-mask").fadeIn(500);
          }
          return false;
        case tag.indexOf("category-mask") != -1:
          set3 = $(".set");
          clone2 = $(".clone-element");
          set3.append(clone2.html()).css("height", "auto");
          clone2.empty().hide();
          $(".category-list-item.active").each(function() {
            var that = $(this);
            setTimeout(function() {
              that.removeClass("active");
            }, 400);
            $(".sub-active").each(function() {
              $(this).removeClass("sub-active");
            });
          });
          $(".category-mask").fadeOut(500);
          return false;
        default:
          return true;
      }
    });
    if ($(".article").length) {
      Obsidian.tocSpy(200);
      buildImgCaption();
    }
    window.onpopstate = function(event2) {
      utiliseBgColor();
    };
    utiliseBgColor();
    Obsidian.setCodeRowWithLang();
    console.log(
      "%c Github %c",
      "background:#24272A; color:#73ddd7",
      "",
      "https://github.com/halo-sigs/halo-theme-obsidian"
    );
  });
  (function(c, e, f, b) {
    var i = "parallax";
    var g = 30;
    var d = { relativeInput: false, clipRelativeInput: false, calibrationThreshold: 100, calibrationDelay: 500, supportDelay: 1e3, calibrateX: false, calibrateY: true, invertX: true, invertY: true, limitX: false, limitY: false, scalarX: 10, scalarY: 10, frictionX: 0.1, frictionY: 0.1, originX: 0.5, originY: 0.5 };
    function h(l, j) {
      this.element = l;
      this.$context = c(l).data("api", this);
      this.$layers = this.$context.find(".layer");
      var m = { calibrateX: this.$context.data("calibrate-x") || null, calibrateY: this.$context.data("calibrate-y") || null, invertX: this.$context.data("invert-x") || null, invertY: this.$context.data("invert-y") || null, limitX: parseFloat(this.$context.data("limit-x")) || null, limitY: parseFloat(this.$context.data("limit-y")) || null, scalarX: parseFloat(this.$context.data("scalar-x")) || null, scalarY: parseFloat(this.$context.data("scalar-y")) || null, frictionX: parseFloat(this.$context.data("friction-x")) || null, frictionY: parseFloat(this.$context.data("friction-y")) || null, originX: parseFloat(this.$context.data("origin-x")) || null, originY: parseFloat(this.$context.data("origin-y")) || null };
      for (var k in m) {
        if (m[k] === null) {
          delete m[k];
        }
      }
      c.extend(this, d, j, m);
      this.calibrationTimer = null;
      this.calibrationFlag = true;
      this.enabled = false;
      this.depths = [];
      this.raf = null;
      this.bounds = null;
      this.ex = 0;
      this.ey = 0;
      this.ew = 0;
      this.eh = 0;
      this.ecx = 0;
      this.ecy = 0;
      this.erx = 0;
      this.ery = 0;
      this.cx = 0;
      this.cy = 0;
      this.ix = 0;
      this.iy = 0;
      this.mx = 0;
      this.my = 0;
      this.vx = 0;
      this.vy = 0;
      this.onMouseMove = this.onMouseMove.bind(this);
      this.onDeviceOrientation = this.onDeviceOrientation.bind(this);
      this.onOrientationTimer = this.onOrientationTimer.bind(this);
      this.onCalibrationTimer = this.onCalibrationTimer.bind(this);
      this.onAnimationFrame = this.onAnimationFrame.bind(this);
      this.onWindowResize = this.onWindowResize.bind(this);
      this.initialise();
    }
    h.prototype.transformSupport = function(w) {
      var p = f.createElement("div");
      var t = false;
      var o = null;
      var s = false;
      var u = null;
      var k = null;
      for (var q = 0, n = this.vendors.length; q < n; q++) {
        if (this.vendors[q] !== null) {
          u = this.vendors[q][0] + "transform";
          k = this.vendors[q][1] + "Transform";
        } else {
          u = "transform";
          k = "transform";
        }
        if (p.style[k] !== b) {
          t = true;
          break;
        }
      }
      switch (w) {
        case "2D":
          s = t;
          break;
        case "3D":
          if (t) {
            var r = f.body || f.createElement("body");
            var v = f.documentElement;
            var m = v.style.overflow;
            var j = false;
            if (!f.body) {
              j = true;
              v.style.overflow = "hidden";
              v.appendChild(r);
              r.style.overflow = "hidden";
              r.style.background = "";
            }
            r.appendChild(p);
            p.style[k] = "translate3d(1px,1px,1px)";
            o = e.getComputedStyle(p).getPropertyValue(u);
            s = o !== b && o.length > 0 && o !== "none";
            v.style.overflow = m;
            r.removeChild(p);
            if (j) {
              r.removeAttribute("style");
              r.parentNode.removeChild(r);
            }
          }
          break;
      }
      return s;
    };
    h.prototype.ww = null;
    h.prototype.wh = null;
    h.prototype.wcx = null;
    h.prototype.wcy = null;
    h.prototype.wrx = null;
    h.prototype.wry = null;
    h.prototype.portrait = null;
    h.prototype.desktop = !navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|BB10|mobi|tablet|opera mini|nexus 7)/i);
    h.prototype.vendors = [null, ["-webkit-", "webkit"], ["-moz-", "Moz"], ["-o-", "O"], ["-ms-", "ms"]];
    h.prototype.motionSupport = !!e.DeviceMotionEvent;
    h.prototype.orientationSupport = !!e.DeviceOrientationEvent;
    h.prototype.orientationStatus = 0;
    h.prototype.transform2DSupport = h.prototype.transformSupport("2D");
    h.prototype.transform3DSupport = h.prototype.transformSupport("3D");
    h.prototype.propertyCache = {};
    h.prototype.initialise = function() {
      if (this.$context.css("position") === "static") {
        this.$context.css({ position: "relative" });
      }
      this.accelerate(this.$context);
      this.updateLayers();
      this.updateDimensions();
      this.enable();
      this.queueCalibration(this.calibrationDelay);
    };
    h.prototype.updateLayers = function() {
      this.$layers = this.$context.find(".layer");
      this.depths = [];
      this.$layers.css({ position: "absolute", display: "block", left: 0, top: 0 });
      this.$layers.first().css({ position: "relative" });
      this.accelerate(this.$layers);
      this.$layers.each(c.proxy(function(j, k) {
        this.depths.push(c(k).data("depth") || 0);
      }, this));
    };
    h.prototype.updateDimensions = function() {
      this.ww = e.innerWidth;
      this.wh = e.innerHeight;
      this.wcx = this.ww * this.originX;
      this.wcy = this.wh * this.originY;
      this.wrx = Math.max(this.wcx, this.ww - this.wcx);
      this.wry = Math.max(this.wcy, this.wh - this.wcy);
    };
    h.prototype.updateBounds = function() {
      this.bounds = this.element.getBoundingClientRect();
      this.ex = this.bounds.left;
      this.ey = this.bounds.top;
      this.ew = this.bounds.width;
      this.eh = this.bounds.height;
      this.ecx = this.ew * this.originX;
      this.ecy = this.eh * this.originY;
      this.erx = Math.max(this.ecx, this.ew - this.ecx);
      this.ery = Math.max(this.ecy, this.eh - this.ecy);
    };
    h.prototype.queueCalibration = function(j) {
      clearTimeout(this.calibrationTimer);
      this.calibrationTimer = setTimeout(this.onCalibrationTimer, j);
    };
    h.prototype.enable = function() {
      if (!this.enabled) {
        this.enabled = true;
        if (this.orientationSupport) {
          this.portrait = null;
          e.addEventListener("deviceorientation", this.onDeviceOrientation);
          setTimeout(this.onOrientationTimer, this.supportDelay);
        } else {
          this.cx = 0;
          this.cy = 0;
          this.portrait = false;
          e.addEventListener("mousemove", this.onMouseMove);
        }
        e.addEventListener("resize", this.onWindowResize);
        this.raf = requestAnimationFrame(this.onAnimationFrame);
      }
    };
    h.prototype.disable = function() {
      if (this.enabled) {
        this.enabled = false;
        if (this.orientationSupport) {
          e.removeEventListener("deviceorientation", this.onDeviceOrientation);
        } else {
          e.removeEventListener("mousemove", this.onMouseMove);
        }
        e.removeEventListener("resize", this.onWindowResize);
        cancelAnimationFrame(this.raf);
      }
    };
    h.prototype.calibrate = function(j, k) {
      this.calibrateX = j === b ? this.calibrateX : j;
      this.calibrateY = k === b ? this.calibrateY : k;
    };
    h.prototype.invert = function(j, k) {
      this.invertX = j === b ? this.invertX : j;
      this.invertY = k === b ? this.invertY : k;
    };
    h.prototype.friction = function(j, k) {
      this.frictionX = j === b ? this.frictionX : j;
      this.frictionY = k === b ? this.frictionY : k;
    };
    h.prototype.scalar = function(j, k) {
      this.scalarX = j === b ? this.scalarX : j;
      this.scalarY = k === b ? this.scalarY : k;
    };
    h.prototype.limit = function(j, k) {
      this.limitX = j === b ? this.limitX : j;
      this.limitY = k === b ? this.limitY : k;
    };
    h.prototype.origin = function(j, k) {
      this.originX = j === b ? this.originX : j;
      this.originY = k === b ? this.originY : k;
    };
    h.prototype.clamp = function(l, k, j) {
      l = Math.max(l, k);
      l = Math.min(l, j);
      return l;
    };
    h.prototype.css = function(m, p, o) {
      var n = this.propertyCache[p];
      if (!n) {
        for (var k = 0, j = this.vendors.length; k < j; k++) {
          if (this.vendors[k] !== null) {
            n = c.camelCase(this.vendors[k][1] + "-" + p);
          } else {
            n = p;
          }
          if (m.style[n] !== b) {
            this.propertyCache[p] = n;
            break;
          }
        }
      }
      m.style[n] = o;
    };
    h.prototype.accelerate = function(k) {
      for (var n = 0, j = k.length; n < j; n++) {
        var m = k[n];
        this.css(m, "transform", "translate3d(0,0,0)");
        this.css(m, "transform-style", "preserve-3d");
        this.css(m, "backface-visibility", "hidden");
      }
    };
    h.prototype.setPosition = function(k, j, l) {
      j += "px";
      l += "px";
      if (this.transform3DSupport) {
        this.css(k, "transform", "translate3d(" + j + "," + l + ",0)");
      } else {
        if (this.transform2DSupport) {
          this.css(k, "transform", "translate(" + j + "," + l + ")");
        } else {
          k.style.left = j;
          k.style.top = l;
        }
      }
    };
    h.prototype.onOrientationTimer = function(j) {
      if (this.orientationSupport && this.orientationStatus === 0) {
        this.disable();
        this.orientationSupport = false;
        this.enable();
      }
    };
    h.prototype.onCalibrationTimer = function(j) {
      this.calibrationFlag = true;
    };
    h.prototype.onWindowResize = function(j) {
      this.updateDimensions();
    };
    h.prototype.onAnimationFrame = function() {
      this.updateBounds();
      var m = this.ix - this.cx;
      var k = this.iy - this.cy;
      if (Math.abs(m) > this.calibrationThreshold || Math.abs(k) > this.calibrationThreshold) {
        this.queueCalibration(0);
      }
      if (this.portrait) {
        this.mx = this.calibrateX ? k : this.iy;
        this.my = this.calibrateY ? m : this.ix;
      } else {
        this.mx = this.calibrateX ? m : this.ix;
        this.my = this.calibrateY ? k : this.iy;
      }
      this.mx *= this.ew * (this.scalarX / 100);
      this.my *= this.eh * (this.scalarY / 100);
      if (!isNaN(parseFloat(this.limitX))) {
        this.mx = this.clamp(this.mx, -this.limitX, this.limitX);
      }
      if (!isNaN(parseFloat(this.limitY))) {
        this.my = this.clamp(this.my, -this.limitY, this.limitY);
      }
      this.vx += (this.mx - this.vx) * this.frictionX;
      this.vy += (this.my - this.vy) * this.frictionY;
      for (var o = 0, j = this.$layers.length; o < j; o++) {
        var r = this.depths[o];
        var n = this.$layers[o];
        var p = this.vx * r * (this.invertX ? -1 : 1);
        var q = this.vy * r * (this.invertY ? -1 : 1);
        this.setPosition(n, p, q);
      }
      this.raf = requestAnimationFrame(this.onAnimationFrame);
    };
    h.prototype.onDeviceOrientation = function(k) {
      if (!this.desktop && k.beta !== null && k.gamma !== null) {
        this.orientationStatus = 1;
        var j = (k.beta || 0) / g;
        var m = (k.gamma || 0) / g;
        var l = e.innerHeight > e.innerWidth;
        if (this.portrait !== l) {
          this.portrait = l;
          this.calibrationFlag = true;
        }
        if (this.calibrationFlag) {
          this.calibrationFlag = false;
          this.cx = j;
          this.cy = m;
        }
        this.ix = j;
        this.iy = m;
      }
    };
    h.prototype.onMouseMove = function(l) {
      var k = l.clientX;
      var j = l.clientY;
      if (!this.orientationSupport && this.relativeInput) {
        if (this.clipRelativeInput) {
          k = Math.max(k, this.ex);
          k = Math.min(k, this.ex + this.ew);
          j = Math.max(j, this.ey);
          j = Math.min(j, this.ey + this.eh);
        }
        this.ix = (k - this.ex - this.ecx) / this.erx;
        this.iy = (j - this.ey - this.ecy) / this.ery;
      } else {
        this.ix = (k - this.wcx) / this.wrx;
        this.iy = (j - this.wcy) / this.wry;
      }
    };
    var a = { enable: h.prototype.enable, disable: h.prototype.disable, updateLayers: h.prototype.updateLayers, calibrate: h.prototype.calibrate, friction: h.prototype.friction, invert: h.prototype.invert, scalar: h.prototype.scalar, limit: h.prototype.limit, origin: h.prototype.origin };
    c.fn[i] = function(k) {
      var j = arguments;
      return this.each(function() {
        var m = c(this);
        var l = m.data(i);
        if (!l) {
          l = new h(this, k);
          m.data(i, l);
        }
        if (a[k]) {
          l[k].apply(l, Array.prototype.slice.call(j, 1));
        }
      });
    };
  })(window.jQuery || window.Zepto, window, document);
  (function() {
    var b = 0;
    var c = ["ms", "moz", "webkit", "o"];
    for (var a = 0; a < c.length && !window.requestAnimationFrame; ++a) {
      window.requestAnimationFrame = window[c[a] + "RequestAnimationFrame"];
      window.cancelAnimationFrame = window[c[a] + "CancelAnimationFrame"] || window[c[a] + "CancelRequestAnimationFrame"];
    }
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = function(h, e) {
        var d = new Date().getTime();
        var f = Math.max(0, 16 - (d - b));
        var g = window.setTimeout(function() {
          h(d + f);
        }, f);
        b = d + f;
        return g;
      };
    }
    if (!window.cancelAnimationFrame) {
      window.cancelAnimationFrame = function(d) {
        clearTimeout(d);
      };
    }
  })();
  (function(r) {
    r.fn.qrcode = function(h) {
      var s;
      function u(a) {
        this.mode = s;
        this.data = a;
      }
      function o(a, c) {
        this.typeNumber = a;
        this.errorCorrectLevel = c;
        this.modules = null;
        this.moduleCount = 0;
        this.dataCache = null;
        this.dataList = [];
      }
      function q(a, c) {
        if (void 0 == a.length)
          throw Error(a.length + "/" + c);
        for (var d = 0; d < a.length && 0 == a[d]; )
          d++;
        this.num = Array(a.length - d + c);
        for (var b = 0; b < a.length - d; b++)
          this.num[b] = a[b + d];
      }
      function p(a, c) {
        this.totalCount = a;
        this.dataCount = c;
      }
      function t() {
        this.buffer = [];
        this.length = 0;
      }
      u.prototype = {
        getLength: function() {
          return this.data.length;
        },
        write: function(a) {
          for (var c = 0; c < this.data.length; c++)
            a.put(this.data.charCodeAt(c), 8);
        }
      };
      o.prototype = {
        addData: function(a) {
          this.dataList.push(new u(a));
          this.dataCache = null;
        },
        isDark: function(a, c) {
          if (0 > a || this.moduleCount <= a || 0 > c || this.moduleCount <= c)
            throw Error(a + "," + c);
          return this.modules[a][c];
        },
        getModuleCount: function() {
          return this.moduleCount;
        },
        make: function() {
          if (1 > this.typeNumber) {
            for (var a = 1, a = 1; 40 > a; a++) {
              for (var c = p.getRSBlocks(a, this.errorCorrectLevel), d = new t(), b = 0, e = 0; e < c.length; e++)
                b += c[e].dataCount;
              for (e = 0; e < this.dataList.length; e++)
                c = this.dataList[e], d.put(c.mode, 4), d.put(c.getLength(), j.getLengthInBits(c.mode, a)), c.write(d);
              if (d.getLengthInBits() <= 8 * b)
                break;
            }
            this.typeNumber = a;
          }
          this.makeImpl(false, this.getBestMaskPattern());
        },
        makeImpl: function(a, c) {
          this.moduleCount = 4 * this.typeNumber + 17;
          this.modules = Array(this.moduleCount);
          for (var d = 0; d < this.moduleCount; d++) {
            this.modules[d] = Array(this.moduleCount);
            for (var b = 0; b < this.moduleCount; b++)
              this.modules[d][b] = null;
          }
          this.setupPositionProbePattern(0, 0);
          this.setupPositionProbePattern(this.moduleCount - 7, 0);
          this.setupPositionProbePattern(0, this.moduleCount - 7);
          this.setupPositionAdjustPattern();
          this.setupTimingPattern();
          this.setupTypeInfo(a, c);
          7 <= this.typeNumber && this.setupTypeNumber(a);
          null == this.dataCache && (this.dataCache = o.createData(this.typeNumber, this.errorCorrectLevel, this.dataList));
          this.mapData(this.dataCache, c);
        },
        setupPositionProbePattern: function(a, c) {
          for (var d = -1; 7 >= d; d++)
            if (!(-1 >= a + d || this.moduleCount <= a + d))
              for (var b = -1; 7 >= b; b++)
                -1 >= c + b || this.moduleCount <= c + b || (this.modules[a + d][c + b] = 0 <= d && 6 >= d && (0 == b || 6 == b) || 0 <= b && 6 >= b && (0 == d || 6 == d) || 2 <= d && 4 >= d && 2 <= b && 4 >= b ? true : false);
        },
        getBestMaskPattern: function() {
          for (var a = 0, c = 0, d = 0; 8 > d; d++) {
            this.makeImpl(true, d);
            var b = j.getLostPoint(this);
            if (0 == d || a > b)
              a = b, c = d;
          }
          return c;
        },
        createMovieClip: function(a, c, d) {
          a = a.createEmptyMovieClip(c, d);
          this.make();
          for (c = 0; c < this.modules.length; c++)
            for (var d = 1 * c, b = 0; b < this.modules[c].length; b++) {
              var e = 1 * b;
              this.modules[c][b] && (a.beginFill(0, 100), a.moveTo(e, d), a.lineTo(e + 1, d), a.lineTo(e + 1, d + 1), a.lineTo(e, d + 1), a.endFill());
            }
          return a;
        },
        setupTimingPattern: function() {
          for (var a = 8; a < this.moduleCount - 8; a++)
            null == this.modules[a][6] && (this.modules[a][6] = 0 == a % 2);
          for (a = 8; a < this.moduleCount - 8; a++)
            null == this.modules[6][a] && (this.modules[6][a] = 0 == a % 2);
        },
        setupPositionAdjustPattern: function() {
          for (var a = j.getPatternPosition(this.typeNumber), c = 0; c < a.length; c++)
            for (var d = 0; d < a.length; d++) {
              var b = a[c], e = a[d];
              if (null == this.modules[b][e])
                for (var f = -2; 2 >= f; f++)
                  for (var i = -2; 2 >= i; i++)
                    this.modules[b + f][e + i] = -2 == f || 2 == f || -2 == i || 2 == i || 0 == f && 0 == i ? true : false;
            }
        },
        setupTypeNumber: function(a) {
          for (var c = j.getBCHTypeNumber(this.typeNumber), d = 0; 18 > d; d++) {
            var b = !a && 1 == (c >> d & 1);
            this.modules[Math.floor(d / 3)][d % 3 + this.moduleCount - 8 - 3] = b;
          }
          for (d = 0; 18 > d; d++)
            b = !a && 1 == (c >> d & 1), this.modules[d % 3 + this.moduleCount - 8 - 3][Math.floor(d / 3)] = b;
        },
        setupTypeInfo: function(a, c) {
          for (var d = j.getBCHTypeInfo(this.errorCorrectLevel << 3 | c), b = 0; 15 > b; b++) {
            var e = !a && 1 == (d >> b & 1);
            6 > b ? this.modules[b][8] = e : 8 > b ? this.modules[b + 1][8] = e : this.modules[this.moduleCount - 15 + b][8] = e;
          }
          for (b = 0; 15 > b; b++)
            e = !a && 1 == (d >> b & 1), 8 > b ? this.modules[8][this.moduleCount - b - 1] = e : 9 > b ? this.modules[8][15 - b - 1 + 1] = e : this.modules[8][15 - b - 1] = e;
          this.modules[this.moduleCount - 8][8] = !a;
        },
        mapData: function(a, c) {
          for (var d = -1, b = this.moduleCount - 1, e = 7, f = 0, i = this.moduleCount - 1; 0 < i; i -= 2)
            for (6 == i && i--; ; ) {
              for (var g = 0; 2 > g; g++)
                if (null == this.modules[b][i - g]) {
                  var n = false;
                  f < a.length && (n = 1 == (a[f] >>> e & 1));
                  j.getMask(c, b, i - g) && (n = !n);
                  this.modules[b][i - g] = n;
                  e--;
                  -1 == e && (f++, e = 7);
                }
              b += d;
              if (0 > b || this.moduleCount <= b) {
                b -= d;
                d = -d;
                break;
              }
            }
        }
      };
      o.PAD0 = 236;
      o.PAD1 = 17;
      o.createData = function(a, c, d) {
        for (var c = p.getRSBlocks(
          a,
          c
        ), b = new t(), e = 0; e < d.length; e++) {
          var f = d[e];
          b.put(f.mode, 4);
          b.put(f.getLength(), j.getLengthInBits(f.mode, a));
          f.write(b);
        }
        for (e = a = 0; e < c.length; e++)
          a += c[e].dataCount;
        if (b.getLengthInBits() > 8 * a)
          throw Error("code length overflow. (" + b.getLengthInBits() + ">" + 8 * a + ")");
        for (b.getLengthInBits() + 4 <= 8 * a && b.put(0, 4); 0 != b.getLengthInBits() % 8; )
          b.putBit(false);
        for (; !(b.getLengthInBits() >= 8 * a); ) {
          b.put(o.PAD0, 8);
          if (b.getLengthInBits() >= 8 * a)
            break;
          b.put(o.PAD1, 8);
        }
        return o.createBytes(b, c);
      };
      o.createBytes = function(a, c) {
        for (var d = 0, b = 0, e = 0, f = Array(c.length), i = Array(c.length), g = 0; g < c.length; g++) {
          var n = c[g].dataCount, h2 = c[g].totalCount - n, b = Math.max(b, n), e = Math.max(e, h2);
          f[g] = Array(n);
          for (var k = 0; k < f[g].length; k++)
            f[g][k] = 255 & a.buffer[k + d];
          d += n;
          k = j.getErrorCorrectPolynomial(h2);
          n = new q(f[g], k.getLength() - 1).mod(k);
          i[g] = Array(k.getLength() - 1);
          for (k = 0; k < i[g].length; k++)
            h2 = k + n.getLength() - i[g].length, i[g][k] = 0 <= h2 ? n.get(h2) : 0;
        }
        for (k = g = 0; k < c.length; k++)
          g += c[k].totalCount;
        d = Array(g);
        for (k = n = 0; k < b; k++)
          for (g = 0; g < c.length; g++)
            k < f[g].length && (d[n++] = f[g][k]);
        for (k = 0; k < e; k++)
          for (g = 0; g < c.length; g++)
            k < i[g].length && (d[n++] = i[g][k]);
        return d;
      };
      s = 4;
      for (var j = { PATTERN_POSITION_TABLE: [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [
        6,
        26,
        52,
        78,
        104,
        130
      ], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]], G15: 1335, G18: 7973, G15_MASK: 21522, getBCHTypeInfo: function(a) {
        for (var c = a << 10; 0 <= j.getBCHDigit(c) - j.getBCHDigit(j.G15); )
          c ^= j.G15 << j.getBCHDigit(c) - j.getBCHDigit(j.G15);
        return (a << 10 | c) ^ j.G15_MASK;
      }, getBCHTypeNumber: function(a) {
        for (var c = a << 12; 0 <= j.getBCHDigit(c) - j.getBCHDigit(j.G18); )
          c ^= j.G18 << j.getBCHDigit(c) - j.getBCHDigit(j.G18);
        return a << 12 | c;
      }, getBCHDigit: function(a) {
        for (var c = 0; 0 != a; )
          c++, a >>>= 1;
        return c;
      }, getPatternPosition: function(a) {
        return j.PATTERN_POSITION_TABLE[a - 1];
      }, getMask: function(a, c, d) {
        switch (a) {
          case 0:
            return 0 == (c + d) % 2;
          case 1:
            return 0 == c % 2;
          case 2:
            return 0 == d % 3;
          case 3:
            return 0 == (c + d) % 3;
          case 4:
            return 0 == (Math.floor(c / 2) + Math.floor(d / 3)) % 2;
          case 5:
            return 0 == c * d % 2 + c * d % 3;
          case 6:
            return 0 == (c * d % 2 + c * d % 3) % 2;
          case 7:
            return 0 == (c * d % 3 + (c + d) % 2) % 2;
          default:
            throw Error("bad maskPattern:" + a);
        }
      }, getErrorCorrectPolynomial: function(a) {
        for (var c = new q([1], 0), d = 0; d < a; d++)
          c = c.multiply(new q([1, l.gexp(d)], 0));
        return c;
      }, getLengthInBits: function(a, c) {
        if (1 <= c && 10 > c)
          switch (a) {
            case 1:
              return 10;
            case 2:
              return 9;
            case s:
              return 8;
            case 8:
              return 8;
            default:
              throw Error("mode:" + a);
          }
        else if (27 > c)
          switch (a) {
            case 1:
              return 12;
            case 2:
              return 11;
            case s:
              return 16;
            case 8:
              return 10;
            default:
              throw Error("mode:" + a);
          }
        else if (41 > c)
          switch (a) {
            case 1:
              return 14;
            case 2:
              return 13;
            case s:
              return 16;
            case 8:
              return 12;
            default:
              throw Error("mode:" + a);
          }
        else
          throw Error("type:" + c);
      }, getLostPoint: function(a) {
        for (var c = a.getModuleCount(), d = 0, b = 0; b < c; b++)
          for (var e = 0; e < c; e++) {
            for (var f = 0, i = a.isDark(b, e), g = -1; 1 >= g; g++)
              if (!(0 > b + g || c <= b + g))
                for (var h2 = -1; 1 >= h2; h2++)
                  0 > e + h2 || c <= e + h2 || 0 == g && 0 == h2 || i == a.isDark(b + g, e + h2) && f++;
            5 < f && (d += 3 + f - 5);
          }
        for (b = 0; b < c - 1; b++)
          for (e = 0; e < c - 1; e++)
            if (f = 0, a.isDark(b, e) && f++, a.isDark(b + 1, e) && f++, a.isDark(b, e + 1) && f++, a.isDark(b + 1, e + 1) && f++, 0 == f || 4 == f)
              d += 3;
        for (b = 0; b < c; b++)
          for (e = 0; e < c - 6; e++)
            a.isDark(b, e) && !a.isDark(b, e + 1) && a.isDark(b, e + 2) && a.isDark(b, e + 3) && a.isDark(b, e + 4) && !a.isDark(b, e + 5) && a.isDark(b, e + 6) && (d += 40);
        for (e = 0; e < c; e++)
          for (b = 0; b < c - 6; b++)
            a.isDark(b, e) && !a.isDark(b + 1, e) && a.isDark(b + 2, e) && a.isDark(b + 3, e) && a.isDark(b + 4, e) && !a.isDark(b + 5, e) && a.isDark(b + 6, e) && (d += 40);
        for (e = f = 0; e < c; e++)
          for (b = 0; b < c; b++)
            a.isDark(b, e) && f++;
        a = Math.abs(100 * f / c / c - 50) / 5;
        return d + 10 * a;
      } }, l = {
        glog: function(a) {
          if (1 > a)
            throw Error("glog(" + a + ")");
          return l.LOG_TABLE[a];
        },
        gexp: function(a) {
          for (; 0 > a; )
            a += 255;
          for (; 256 <= a; )
            a -= 255;
          return l.EXP_TABLE[a];
        },
        EXP_TABLE: Array(256),
        LOG_TABLE: Array(256)
      }, m = 0; 8 > m; m++)
        l.EXP_TABLE[m] = 1 << m;
      for (m = 8; 256 > m; m++)
        l.EXP_TABLE[m] = l.EXP_TABLE[m - 4] ^ l.EXP_TABLE[m - 5] ^ l.EXP_TABLE[m - 6] ^ l.EXP_TABLE[m - 8];
      for (m = 0; 255 > m; m++)
        l.LOG_TABLE[l.EXP_TABLE[m]] = m;
      q.prototype = { get: function(a) {
        return this.num[a];
      }, getLength: function() {
        return this.num.length;
      }, multiply: function(a) {
        for (var c = Array(this.getLength() + a.getLength() - 1), d = 0; d < this.getLength(); d++)
          for (var b = 0; b < a.getLength(); b++)
            c[d + b] ^= l.gexp(l.glog(this.get(d)) + l.glog(a.get(b)));
        return new q(c, 0);
      }, mod: function(a) {
        if (0 > this.getLength() - a.getLength())
          return this;
        for (var c = l.glog(this.get(0)) - l.glog(a.get(0)), d = Array(this.getLength()), b = 0; b < this.getLength(); b++)
          d[b] = this.get(b);
        for (b = 0; b < a.getLength(); b++)
          d[b] ^= l.gexp(l.glog(a.get(b)) + c);
        return new q(d, 0).mod(a);
      } };
      p.RS_BLOCK_TABLE = [
        [1, 26, 19],
        [1, 26, 16],
        [1, 26, 13],
        [1, 26, 9],
        [1, 44, 34],
        [1, 44, 28],
        [1, 44, 22],
        [1, 44, 16],
        [1, 70, 55],
        [1, 70, 44],
        [2, 35, 17],
        [2, 35, 13],
        [1, 100, 80],
        [2, 50, 32],
        [2, 50, 24],
        [4, 25, 9],
        [1, 134, 108],
        [2, 67, 43],
        [2, 33, 15, 2, 34, 16],
        [2, 33, 11, 2, 34, 12],
        [2, 86, 68],
        [4, 43, 27],
        [4, 43, 19],
        [4, 43, 15],
        [2, 98, 78],
        [4, 49, 31],
        [2, 32, 14, 4, 33, 15],
        [4, 39, 13, 1, 40, 14],
        [2, 121, 97],
        [2, 60, 38, 2, 61, 39],
        [4, 40, 18, 2, 41, 19],
        [4, 40, 14, 2, 41, 15],
        [2, 146, 116],
        [3, 58, 36, 2, 59, 37],
        [4, 36, 16, 4, 37, 17],
        [4, 36, 12, 4, 37, 13],
        [2, 86, 68, 2, 87, 69],
        [4, 69, 43, 1, 70, 44],
        [6, 43, 19, 2, 44, 20],
        [6, 43, 15, 2, 44, 16],
        [4, 101, 81],
        [1, 80, 50, 4, 81, 51],
        [4, 50, 22, 4, 51, 23],
        [3, 36, 12, 8, 37, 13],
        [2, 116, 92, 2, 117, 93],
        [6, 58, 36, 2, 59, 37],
        [4, 46, 20, 6, 47, 21],
        [7, 42, 14, 4, 43, 15],
        [4, 133, 107],
        [8, 59, 37, 1, 60, 38],
        [8, 44, 20, 4, 45, 21],
        [12, 33, 11, 4, 34, 12],
        [
          3,
          145,
          115,
          1,
          146,
          116
        ],
        [4, 64, 40, 5, 65, 41],
        [11, 36, 16, 5, 37, 17],
        [11, 36, 12, 5, 37, 13],
        [5, 109, 87, 1, 110, 88],
        [5, 65, 41, 5, 66, 42],
        [5, 54, 24, 7, 55, 25],
        [11, 36, 12],
        [5, 122, 98, 1, 123, 99],
        [7, 73, 45, 3, 74, 46],
        [15, 43, 19, 2, 44, 20],
        [3, 45, 15, 13, 46, 16],
        [1, 135, 107, 5, 136, 108],
        [10, 74, 46, 1, 75, 47],
        [1, 50, 22, 15, 51, 23],
        [2, 42, 14, 17, 43, 15],
        [5, 150, 120, 1, 151, 121],
        [9, 69, 43, 4, 70, 44],
        [17, 50, 22, 1, 51, 23],
        [2, 42, 14, 19, 43, 15],
        [3, 141, 113, 4, 142, 114],
        [3, 70, 44, 11, 71, 45],
        [17, 47, 21, 4, 48, 22],
        [9, 39, 13, 16, 40, 14],
        [3, 135, 107, 5, 136, 108],
        [3, 67, 41, 13, 68, 42],
        [15, 54, 24, 5, 55, 25],
        [
          15,
          43,
          15,
          10,
          44,
          16
        ],
        [4, 144, 116, 4, 145, 117],
        [17, 68, 42],
        [17, 50, 22, 6, 51, 23],
        [19, 46, 16, 6, 47, 17],
        [2, 139, 111, 7, 140, 112],
        [17, 74, 46],
        [7, 54, 24, 16, 55, 25],
        [34, 37, 13],
        [4, 151, 121, 5, 152, 122],
        [4, 75, 47, 14, 76, 48],
        [11, 54, 24, 14, 55, 25],
        [16, 45, 15, 14, 46, 16],
        [6, 147, 117, 4, 148, 118],
        [6, 73, 45, 14, 74, 46],
        [11, 54, 24, 16, 55, 25],
        [30, 46, 16, 2, 47, 17],
        [8, 132, 106, 4, 133, 107],
        [8, 75, 47, 13, 76, 48],
        [7, 54, 24, 22, 55, 25],
        [22, 45, 15, 13, 46, 16],
        [10, 142, 114, 2, 143, 115],
        [19, 74, 46, 4, 75, 47],
        [28, 50, 22, 6, 51, 23],
        [33, 46, 16, 4, 47, 17],
        [8, 152, 122, 4, 153, 123],
        [
          22,
          73,
          45,
          3,
          74,
          46
        ],
        [8, 53, 23, 26, 54, 24],
        [12, 45, 15, 28, 46, 16],
        [3, 147, 117, 10, 148, 118],
        [3, 73, 45, 23, 74, 46],
        [4, 54, 24, 31, 55, 25],
        [11, 45, 15, 31, 46, 16],
        [7, 146, 116, 7, 147, 117],
        [21, 73, 45, 7, 74, 46],
        [1, 53, 23, 37, 54, 24],
        [19, 45, 15, 26, 46, 16],
        [5, 145, 115, 10, 146, 116],
        [19, 75, 47, 10, 76, 48],
        [15, 54, 24, 25, 55, 25],
        [23, 45, 15, 25, 46, 16],
        [13, 145, 115, 3, 146, 116],
        [2, 74, 46, 29, 75, 47],
        [42, 54, 24, 1, 55, 25],
        [23, 45, 15, 28, 46, 16],
        [17, 145, 115],
        [10, 74, 46, 23, 75, 47],
        [10, 54, 24, 35, 55, 25],
        [19, 45, 15, 35, 46, 16],
        [17, 145, 115, 1, 146, 116],
        [14, 74, 46, 21, 75, 47],
        [
          29,
          54,
          24,
          19,
          55,
          25
        ],
        [11, 45, 15, 46, 46, 16],
        [13, 145, 115, 6, 146, 116],
        [14, 74, 46, 23, 75, 47],
        [44, 54, 24, 7, 55, 25],
        [59, 46, 16, 1, 47, 17],
        [12, 151, 121, 7, 152, 122],
        [12, 75, 47, 26, 76, 48],
        [39, 54, 24, 14, 55, 25],
        [22, 45, 15, 41, 46, 16],
        [6, 151, 121, 14, 152, 122],
        [6, 75, 47, 34, 76, 48],
        [46, 54, 24, 10, 55, 25],
        [2, 45, 15, 64, 46, 16],
        [17, 152, 122, 4, 153, 123],
        [29, 74, 46, 14, 75, 47],
        [49, 54, 24, 10, 55, 25],
        [24, 45, 15, 46, 46, 16],
        [4, 152, 122, 18, 153, 123],
        [13, 74, 46, 32, 75, 47],
        [48, 54, 24, 14, 55, 25],
        [42, 45, 15, 32, 46, 16],
        [20, 147, 117, 4, 148, 118],
        [40, 75, 47, 7, 76, 48],
        [43, 54, 24, 22, 55, 25],
        [
          10,
          45,
          15,
          67,
          46,
          16
        ],
        [19, 148, 118, 6, 149, 119],
        [18, 75, 47, 31, 76, 48],
        [34, 54, 24, 34, 55, 25],
        [20, 45, 15, 61, 46, 16]
      ];
      p.getRSBlocks = function(a, c) {
        var d = p.getRsBlockTable(a, c);
        if (void 0 == d)
          throw Error("bad rs block @ typeNumber:" + a + "/errorCorrectLevel:" + c);
        for (var b = d.length / 3, e = [], f = 0; f < b; f++)
          for (var h2 = d[3 * f + 0], g = d[3 * f + 1], j2 = d[3 * f + 2], l2 = 0; l2 < h2; l2++)
            e.push(new p(g, j2));
        return e;
      };
      p.getRsBlockTable = function(a, c) {
        switch (c) {
          case 1:
            return p.RS_BLOCK_TABLE[4 * (a - 1) + 0];
          case 0:
            return p.RS_BLOCK_TABLE[4 * (a - 1) + 1];
          case 3:
            return p.RS_BLOCK_TABLE[4 * (a - 1) + 2];
          case 2:
            return p.RS_BLOCK_TABLE[4 * (a - 1) + 3];
        }
      };
      t.prototype = { get: function(a) {
        return 1 == (this.buffer[Math.floor(a / 8)] >>> 7 - a % 8 & 1);
      }, put: function(a, c) {
        for (var d = 0; d < c; d++)
          this.putBit(1 == (a >>> c - d - 1 & 1));
      }, getLengthInBits: function() {
        return this.length;
      }, putBit: function(a) {
        var c = Math.floor(this.length / 8);
        this.buffer.length <= c && this.buffer.push(0);
        a && (this.buffer[c] |= 128 >>> this.length % 8);
        this.length++;
      } };
      "string" === typeof h && (h = { text: h });
      h = r.extend({}, {
        render: "canvas",
        width: 256,
        height: 256,
        typeNumber: -1,
        correctLevel: 2,
        background: "#ffffff",
        foreground: "#000000"
      }, h);
      return this.each(function() {
        var a;
        if ("canvas" == h.render) {
          a = new o(h.typeNumber, h.correctLevel);
          a.addData(h.text);
          a.make();
          var c = document.createElement("canvas");
          c.width = h.width;
          c.height = h.height;
          for (var d = c.getContext("2d"), b = h.width / a.getModuleCount(), e = h.height / a.getModuleCount(), f = 0; f < a.getModuleCount(); f++)
            for (var i = 0; i < a.getModuleCount(); i++) {
              d.fillStyle = a.isDark(f, i) ? h.foreground : h.background;
              var g = Math.ceil((i + 1) * b) - Math.floor(i * b), j2 = Math.ceil((f + 1) * b) - Math.floor(f * b);
              d.fillRect(Math.round(i * b), Math.round(f * e), g, j2);
            }
        } else {
          a = new o(h.typeNumber, h.correctLevel);
          a.addData(h.text);
          a.make();
          c = r("<table></table>").css("width", h.width + "px").css("height", h.height + "px").css("border", "0px").css("border-collapse", "collapse").css("background-color", h.background);
          d = h.width / a.getModuleCount();
          b = h.height / a.getModuleCount();
          for (e = 0; e < a.getModuleCount(); e++) {
            f = r("<tr></tr>").css("height", b + "px").appendTo(c);
            for (i = 0; i < a.getModuleCount(); i++)
              r("<td></td>").css(
                "width",
                d + "px"
              ).css("background-color", a.isDark(e, i) ? h.foreground : h.background).appendTo(f);
          }
        }
        a = c;
        jQuery(a).appendTo(this);
      });
    };
  })(jQuery);
  (function e$$0(x, z, l) {
    function h(p, b) {
      if (!z[p]) {
        if (!x[p]) {
          var a = "function" == typeof require && require;
          if (!b && a)
            return a(p, true);
          if (g)
            return g(p, true);
          a = Error("Cannot find module '" + p + "'");
          throw a.code = "MODULE_NOT_FOUND", a;
        }
        a = z[p] = { exports: {} };
        x[p][0].call(a.exports, function(a2) {
          var b2 = x[p][1][a2];
          return h(b2 ? b2 : a2);
        }, a, a.exports, e$$0, x, z, l);
      }
      return z[p].exports;
    }
    for (var g = "function" == typeof require && require, w = 0; w < l.length; w++)
      h(l[w]);
    return h;
  })({ 1: [function(A, x, z) {
    if (!l)
      var l = { map: function(h, g) {
        var l2 = {};
        return g ? h.map(function(h2, b) {
          l2.index = b;
          return g.call(l2, h2);
        }) : h.slice();
      }, naturalOrder: function(h, g) {
        return h < g ? -1 : h > g ? 1 : 0;
      }, sum: function(h, g) {
        var l2 = {};
        return h.reduce(g ? function(h2, b, a) {
          l2.index = a;
          return h2 + g.call(l2, b);
        } : function(h2, b) {
          return h2 + b;
        }, 0);
      }, max: function(h, g) {
        return Math.max.apply(null, g ? l.map(h, g) : h);
      } };
    A = function() {
      function h(f, c, a2) {
        return (f << 2 * d) + (c << d) + a2;
      }
      function g(f) {
        function c() {
          a2.sort(f);
          b2 = true;
        }
        var a2 = [], b2 = false;
        return {
          push: function(c2) {
            a2.push(c2);
            b2 = false;
          },
          peek: function(f2) {
            b2 || c();
            void 0 === f2 && (f2 = a2.length - 1);
            return a2[f2];
          },
          pop: function() {
            b2 || c();
            return a2.pop();
          },
          size: function() {
            return a2.length;
          },
          map: function(c2) {
            return a2.map(c2);
          },
          debug: function() {
            b2 || c();
            return a2;
          }
        };
      }
      function w(f, c, a2, b2, m, e2, q) {
        this.r1 = f;
        this.r2 = c;
        this.g1 = a2;
        this.g2 = b2;
        this.b1 = m;
        this.b2 = e2;
        this.histo = q;
      }
      function p() {
        this.vboxes = new g(function(f, c) {
          return l.naturalOrder(f.vbox.count() * f.vbox.volume(), c.vbox.count() * c.vbox.volume());
        });
      }
      function b(f) {
        var c = Array(1 << 3 * d), a2, b2, m, r;
        f.forEach(function(f2) {
          b2 = f2[0] >> e;
          m = f2[1] >> e;
          r = f2[2] >> e;
          a2 = h(b2, m, r);
          c[a2] = (c[a2] || 0) + 1;
        });
        return c;
      }
      function a(f, c) {
        var a2 = 1e6, b2 = 0, m = 1e6, d2 = 0, q = 1e6, n2 = 0, h2, k, l2;
        f.forEach(function(c2) {
          h2 = c2[0] >> e;
          k = c2[1] >> e;
          l2 = c2[2] >> e;
          h2 < a2 ? a2 = h2 : h2 > b2 && (b2 = h2);
          k < m ? m = k : k > d2 && (d2 = k);
          l2 < q ? q = l2 : l2 > n2 && (n2 = l2);
        });
        return new w(a2, b2, m, d2, q, n2, c);
      }
      function n(a2, c) {
        function b2(a3) {
          var f = a3 + "1";
          a3 += "2";
          var v, d3, m2, e3;
          d3 = 0;
          for (k = c[f]; k <= c[a3]; k++)
            if (y[k] > n2 / 2) {
              m2 = c.copy();
              e3 = c.copy();
              v = k - c[f];
              d3 = c[a3] - k;
              for (v = v <= d3 ? Math.min(c[a3] - 1, ~~(k + d3 / 2)) : Math.max(c[f], ~~(k - 1 - v / 2)); !y[v]; )
                v++;
              for (d3 = s[v]; !d3 && y[v - 1]; )
                d3 = s[--v];
              m2[a3] = v;
              e3[f] = m2[a3] + 1;
              return [m2, e3];
            }
        }
        if (c.count()) {
          var d2 = c.r2 - c.r1 + 1, m = c.g2 - c.g1 + 1, e2 = l.max([d2, m, c.b2 - c.b1 + 1]);
          if (1 == c.count())
            return [c.copy()];
          var n2 = 0, y = [], s = [], k, g2, t, u, p2;
          if (e2 == d2)
            for (k = c.r1; k <= c.r2; k++) {
              u = 0;
              for (g2 = c.g1; g2 <= c.g2; g2++)
                for (t = c.b1; t <= c.b2; t++)
                  p2 = h(k, g2, t), u += a2[p2] || 0;
              n2 += u;
              y[k] = n2;
            }
          else if (e2 == m)
            for (k = c.g1; k <= c.g2; k++) {
              u = 0;
              for (g2 = c.r1; g2 <= c.r2; g2++)
                for (t = c.b1; t <= c.b2; t++)
                  p2 = h(g2, k, t), u += a2[p2] || 0;
              n2 += u;
              y[k] = n2;
            }
          else
            for (k = c.b1; k <= c.b2; k++) {
              u = 0;
              for (g2 = c.r1; g2 <= c.r2; g2++)
                for (t = c.g1; t <= c.g2; t++)
                  p2 = h(g2, t, k), u += a2[p2] || 0;
              n2 += u;
              y[k] = n2;
            }
          y.forEach(function(a3, c2) {
            s[c2] = n2 - a3;
          });
          return e2 == d2 ? b2("r") : e2 == m ? b2("g") : b2("b");
        }
      }
      var d = 5, e = 8 - d;
      w.prototype = { volume: function(a2) {
        if (!this._volume || a2)
          this._volume = (this.r2 - this.r1 + 1) * (this.g2 - this.g1 + 1) * (this.b2 - this.b1 + 1);
        return this._volume;
      }, count: function(a2) {
        var c = this.histo;
        if (!this._count_set || a2) {
          a2 = 0;
          var b2, d2, n2;
          for (b2 = this.r1; b2 <= this.r2; b2++)
            for (d2 = this.g1; d2 <= this.g2; d2++)
              for (n2 = this.b1; n2 <= this.b2; n2++)
                index = h(b2, d2, n2), a2 += c[index] || 0;
          this._count = a2;
          this._count_set = true;
        }
        return this._count;
      }, copy: function() {
        return new w(
          this.r1,
          this.r2,
          this.g1,
          this.g2,
          this.b1,
          this.b2,
          this.histo
        );
      }, avg: function(a2) {
        var c = this.histo;
        if (!this._avg || a2) {
          a2 = 0;
          var b2 = 1 << 8 - d, n2 = 0, e2 = 0, g2 = 0, q, l2, s, k;
          for (l2 = this.r1; l2 <= this.r2; l2++)
            for (s = this.g1; s <= this.g2; s++)
              for (k = this.b1; k <= this.b2; k++)
                q = h(l2, s, k), q = c[q] || 0, a2 += q, n2 += q * (l2 + 0.5) * b2, e2 += q * (s + 0.5) * b2, g2 += q * (k + 0.5) * b2;
          this._avg = a2 ? [~~(n2 / a2), ~~(e2 / a2), ~~(g2 / a2)] : [~~(b2 * (this.r1 + this.r2 + 1) / 2), ~~(b2 * (this.g1 + this.g2 + 1) / 2), ~~(b2 * (this.b1 + this.b2 + 1) / 2)];
        }
        return this._avg;
      }, contains: function(a2) {
        var c = a2[0] >> e;
        gval = a2[1] >> e;
        bval = a2[2] >> e;
        return c >= this.r1 && c <= this.r2 && gval >= this.g1 && gval <= this.g2 && bval >= this.b1 && bval <= this.b2;
      } };
      p.prototype = { push: function(a2) {
        this.vboxes.push({ vbox: a2, color: a2.avg() });
      }, palette: function() {
        return this.vboxes.map(function(a2) {
          return a2.color;
        });
      }, size: function() {
        return this.vboxes.size();
      }, map: function(a2) {
        for (var c = this.vboxes, b2 = 0; b2 < c.size(); b2++)
          if (c.peek(b2).vbox.contains(a2))
            return c.peek(b2).color;
        return this.nearest(a2);
      }, nearest: function(a2) {
        for (var c = this.vboxes, b2, n2, d2, e2 = 0; e2 < c.size(); e2++)
          if (n2 = Math.sqrt(Math.pow(a2[0] - c.peek(e2).color[0], 2) + Math.pow(a2[1] - c.peek(e2).color[1], 2) + Math.pow(a2[2] - c.peek(e2).color[2], 2)), n2 < b2 || void 0 === b2)
            b2 = n2, d2 = c.peek(e2).color;
        return d2;
      }, forcebw: function() {
        var a2 = this.vboxes;
        a2.sort(function(a3, b3) {
          return l.naturalOrder(l.sum(a3.color), l.sum(b3.color));
        });
        var b2 = a2[0].color;
        5 > b2[0] && 5 > b2[1] && 5 > b2[2] && (a2[0].color = [0, 0, 0]);
        var b2 = a2.length - 1, n2 = a2[b2].color;
        251 < n2[0] && 251 < n2[1] && 251 < n2[2] && (a2[b2].color = [255, 255, 255]);
      } };
      return { quantize: function(d2, c) {
        function e2(a2, b2) {
          for (var c2 = 1, d3 = 0, f; 1e3 > d3; )
            if (f = a2.pop(), f.count()) {
              var m = n(h2, f);
              f = m[0];
              m = m[1];
              if (!f)
                break;
              a2.push(f);
              m && (a2.push(m), c2++);
              if (c2 >= b2)
                break;
              if (1e3 < d3++)
                break;
            } else
              a2.push(f), d3++;
        }
        if (!d2.length || 2 > c || 256 < c)
          return false;
        var h2 = b(d2);
        h2.forEach(function() {
        });
        var r = a(d2, h2), q = new g(function(a2, b2) {
          return l.naturalOrder(a2.count(), b2.count());
        });
        q.push(r);
        e2(q, 0.75 * c);
        for (r = new g(function(a2, b2) {
          return l.naturalOrder(a2.count() * a2.volume(), b2.count() * b2.volume());
        }); q.size(); )
          r.push(q.pop());
        e2(r, c - r.size());
        for (q = new p(); r.size(); )
          q.push(r.pop());
        return q;
      } };
    }();
    x.exports = A.quantize;
  }, {}], 2: [function(A, x, z) {
    (function() {
      var l, h, g, w = function(b, a) {
        return function() {
          return b.apply(a, arguments);
        };
      }, p = [].slice;
      window.Swatch = h = function() {
        function b(a, b2) {
          this.rgb = a;
          this.population = b2;
        }
        b.prototype.hsl = void 0;
        b.prototype.rgb = void 0;
        b.prototype.population = 1;
        b.yiq = 0;
        b.prototype.getHsl = function() {
          return this.hsl ? this.hsl : this.hsl = g.rgbToHsl(this.rgb[0], this.rgb[1], this.rgb[2]);
        };
        b.prototype.getPopulation = function() {
          return this.population;
        };
        b.prototype.getRgb = function() {
          return this.rgb;
        };
        b.prototype.getHex = function() {
          return "#" + (16777216 + (this.rgb[0] << 16) + (this.rgb[1] << 8) + this.rgb[2]).toString(16).slice(1, 7);
        };
        b.prototype.getTitleTextColor = function() {
          this._ensureTextColors();
          return 200 > this.yiq ? "#fff" : "#000";
        };
        b.prototype.getBodyTextColor = function() {
          this._ensureTextColors();
          return 150 > this.yiq ? "#fff" : "#000";
        };
        b.prototype._ensureTextColors = function() {
          if (!this.yiq)
            return this.yiq = (299 * this.rgb[0] + 587 * this.rgb[1] + 114 * this.rgb[2]) / 1e3;
        };
        return b;
      }();
      window.Vibrant = g = function() {
        function b(a, b2, d) {
          this.swatches = w(this.swatches, this);
          var e, f, c, g2, p2, m, r, q;
          "undefined" === typeof b2 && (b2 = 64);
          "undefined" === typeof d && (d = 5);
          p2 = new l(a);
          r = p2.getImageData().data;
          m = p2.getPixelCount();
          a = [];
          for (g2 = 0; g2 < m; )
            e = 4 * g2, q = r[e + 0], c = r[e + 1], f = r[e + 2], e = r[e + 3], 125 <= e && (250 < q && 250 < c && 250 < f || a.push([q, c, f])), g2 += d;
          this._swatches = this.quantize(a, b2).vboxes.map(function(a2) {
            return function(a3) {
              return new h(a3.color, a3.vbox.count());
            };
          }());
          this.maxPopulation = this.findMaxPopulation;
          this.generateVarationColors();
          this.generateEmptySwatches();
          p2.removeCanvas();
        }
        b.prototype.quantize = A("quantize");
        b.prototype._swatches = [];
        b.prototype.TARGET_DARK_LUMA = 0.26;
        b.prototype.MAX_DARK_LUMA = 0.45;
        b.prototype.MIN_LIGHT_LUMA = 0.55;
        b.prototype.TARGET_LIGHT_LUMA = 0.74;
        b.prototype.MIN_NORMAL_LUMA = 0.3;
        b.prototype.TARGET_NORMAL_LUMA = 0.5;
        b.prototype.MAX_NORMAL_LUMA = 0.7;
        b.prototype.TARGET_MUTED_SATURATION = 0.3;
        b.prototype.MAX_MUTED_SATURATION = 0.4;
        b.prototype.TARGET_VIBRANT_SATURATION = 1;
        b.prototype.MIN_VIBRANT_SATURATION = 0.35;
        b.prototype.WEIGHT_SATURATION = 3;
        b.prototype.WEIGHT_LUMA = 6;
        b.prototype.WEIGHT_POPULATION = 1;
        b.prototype.VibrantSwatch = void 0;
        b.prototype.MutedSwatch = void 0;
        b.prototype.DarkVibrantSwatch = void 0;
        b.prototype.DarkMutedSwatch = void 0;
        b.prototype.LightVibrantSwatch = void 0;
        b.prototype.LightMutedSwatch = void 0;
        b.prototype.HighestPopulation = 0;
        b.prototype.generateVarationColors = function() {
          this.VibrantSwatch = this.findColorVariation(this.TARGET_NORMAL_LUMA, this.MIN_NORMAL_LUMA, this.MAX_NORMAL_LUMA, this.TARGET_VIBRANT_SATURATION, this.MIN_VIBRANT_SATURATION, 1);
          this.LightVibrantSwatch = this.findColorVariation(
            this.TARGET_LIGHT_LUMA,
            this.MIN_LIGHT_LUMA,
            1,
            this.TARGET_VIBRANT_SATURATION,
            this.MIN_VIBRANT_SATURATION,
            1
          );
          this.DarkVibrantSwatch = this.findColorVariation(this.TARGET_DARK_LUMA, 0, this.MAX_DARK_LUMA, this.TARGET_VIBRANT_SATURATION, this.MIN_VIBRANT_SATURATION, 1);
          this.MutedSwatch = this.findColorVariation(this.TARGET_NORMAL_LUMA, this.MIN_NORMAL_LUMA, this.MAX_NORMAL_LUMA, this.TARGET_MUTED_SATURATION, 0, this.MAX_MUTED_SATURATION);
          this.LightMutedSwatch = this.findColorVariation(
            this.TARGET_LIGHT_LUMA,
            this.MIN_LIGHT_LUMA,
            1,
            this.TARGET_MUTED_SATURATION,
            0,
            this.MAX_MUTED_SATURATION
          );
          return this.DarkMutedSwatch = this.findColorVariation(this.TARGET_DARK_LUMA, 0, this.MAX_DARK_LUMA, this.TARGET_MUTED_SATURATION, 0, this.MAX_MUTED_SATURATION);
        };
        b.prototype.generateEmptySwatches = function() {
          var a;
          void 0 === this.VibrantSwatch && void 0 !== this.DarkVibrantSwatch && (a = this.DarkVibrantSwatch.getHsl(), a[2] = this.TARGET_NORMAL_LUMA, this.VibrantSwatch = new h(b.hslToRgb(a[0], a[1], a[2]), 0));
          if (void 0 === this.DarkVibrantSwatch && void 0 !== this.VibrantSwatch)
            return a = this.VibrantSwatch.getHsl(), a[2] = this.TARGET_DARK_LUMA, this.DarkVibrantSwatch = new h(b.hslToRgb(a[0], a[1], a[2]), 0);
        };
        b.prototype.findMaxPopulation = function() {
          var a, b2, d, e, f;
          d = 0;
          e = this._swatches;
          a = 0;
          for (b2 = e.length; a < b2; a++)
            f = e[a], d = Math.max(d, f.getPopulation());
          return d;
        };
        b.prototype.findColorVariation = function(a, b2, d, e, f, c) {
          var g2, h2, m, l2, q, p2, s, k;
          l2 = void 0;
          q = 0;
          p2 = this._swatches;
          g2 = 0;
          for (h2 = p2.length; g2 < h2; g2++)
            if (k = p2[g2], s = k.getHsl()[1], m = k.getHsl()[2], s >= f && s <= c && m >= b2 && m <= d && !this.isAlreadySelected(k) && (m = this.createComparisonValue(
              s,
              e,
              m,
              a,
              k.getPopulation(),
              this.HighestPopulation
            ), void 0 === l2 || m > q))
              l2 = k, q = m;
          return l2;
        };
        b.prototype.createComparisonValue = function(a, b2, d, e, f, c) {
          return this.weightedMean(this.invertDiff(a, b2), this.WEIGHT_SATURATION, this.invertDiff(d, e), this.WEIGHT_LUMA, f / c, this.WEIGHT_POPULATION);
        };
        b.prototype.invertDiff = function(a, b2) {
          return 1 - Math.abs(a - b2);
        };
        b.prototype.weightedMean = function() {
          var a, b2, d, e, f, c;
          f = 1 <= arguments.length ? p.call(arguments, 0) : [];
          for (a = d = b2 = 0; a < f.length; )
            e = f[a], c = f[a + 1], b2 += e * c, d += c, a += 2;
          return b2 / d;
        };
        b.prototype.swatches = function() {
          return { Vibrant: this.VibrantSwatch, Muted: this.MutedSwatch, DarkVibrant: this.DarkVibrantSwatch, DarkMuted: this.DarkMutedSwatch, LightVibrant: this.LightVibrantSwatch, LightMuted: this.LightMuted };
        };
        b.prototype.isAlreadySelected = function(a) {
          return this.VibrantSwatch === a || this.DarkVibrantSwatch === a || this.LightVibrantSwatch === a || this.MutedSwatch === a || this.DarkMutedSwatch === a || this.LightMutedSwatch === a;
        };
        b.rgbToHsl = function(a, b2, d) {
          var e, f, c, g2, h2;
          a /= 255;
          b2 /= 255;
          d /= 255;
          g2 = Math.max(a, b2, d);
          h2 = Math.min(a, b2, d);
          f = void 0;
          c = (g2 + h2) / 2;
          if (g2 === h2)
            f = h2 = 0;
          else {
            e = g2 - h2;
            h2 = 0.5 < c ? e / (2 - g2 - h2) : e / (g2 + h2);
            switch (g2) {
              case a:
                f = (b2 - d) / e + (b2 < d ? 6 : 0);
                break;
              case b2:
                f = (d - a) / e + 2;
                break;
              case d:
                f = (a - b2) / e + 4;
            }
            f /= 6;
          }
          return [f, h2, c];
        };
        b.hslToRgb = function(a, b2, d) {
          var e, f, c;
          e = f = c = void 0;
          e = function(a2, b3, c2) {
            0 > c2 && (c2 += 1);
            1 < c2 && (c2 -= 1);
            return c2 < 1 / 6 ? a2 + 6 * (b3 - a2) * c2 : 0.5 > c2 ? b3 : c2 < 2 / 3 ? a2 + (b3 - a2) * (2 / 3 - c2) * 6 : a2;
          };
          0 === b2 ? c = f = e = d : (b2 = 0.5 > d ? d * (1 + b2) : d + b2 - d * b2, d = 2 * d - b2, c = e(d, b2, a + 1 / 3), f = e(d, b2, a), e = e(d, b2, a - 1 / 3));
          return [255 * c, 255 * f, 255 * e];
        };
        return b;
      }();
      window.CanvasImage = l = function() {
        function b(a) {
          this.canvas = document.createElement("canvas");
          this.context = this.canvas.getContext("2d");
          document.body.appendChild(this.canvas);
          this.width = this.canvas.width = a.width;
          this.height = this.canvas.height = a.height;
          this.context.drawImage(a, 0, 0, this.width, this.height);
        }
        b.prototype.clear = function() {
          return this.context.clearRect(0, 0, this.width, this.height);
        };
        b.prototype.update = function(a) {
          return this.context.putImageData(a, 0, 0);
        };
        b.prototype.getPixelCount = function() {
          return this.width * this.height;
        };
        b.prototype.getImageData = function() {
          return this.context.getImageData(
            0,
            0,
            this.width,
            this.height
          );
        };
        b.prototype.removeCanvas = function() {
          return this.canvas.parentNode.removeChild(this.canvas);
        };
        return b;
      }();
    }).call(this);
  }, { quantize: 1 }] }, {}, [2]);
  window.Alpine = module_default;
  module_default.start();
  function generateToc() {
    const content = document.getElementById("content");
    const titles = content == null ? void 0 : content.querySelectorAll("h1, h2, h3, h4");
    console.log("titles", titles);
    if (!titles || titles.length === 0) {
      const tocContainer = document.querySelector(".t");
      tocContainer == null ? void 0 : tocContainer.remove();
      return;
    }
    js.exports.init({
      tocSelector: ".toc",
      contentSelector: "#content",
      headingSelector: "h1, h2, h3, h4",
      linkClass: "toc-link",
      listItemClass: "toc-item",
      activeListItemClass: "active"
    });
  }
  exports.generateToc = generateToc;
  Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
  return exports;
}({});
