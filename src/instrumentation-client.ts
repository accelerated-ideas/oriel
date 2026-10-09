// Runs before every page becomes interactive: the dashboard, the site and the
// widget's frame.

// Google Translate (and some extensions) replace React-owned text nodes with
// their own elements. React's next removeChild/insertBefore on those nodes then
// throws NotFoundError and the error boundary takes down the whole page.
// See https://github.com/facebook/react/issues/11538
if (typeof Node === "function" && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T) {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
