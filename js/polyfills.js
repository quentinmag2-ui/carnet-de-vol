// Compatibilité avec les iPhone pas tout à fait à jour : pdf.js parcourt ses flux de données
// avec « for await », que Safari ne sait faire que depuis ses versions récentes.
// Ce complément ajoute ce parcours aux anciennes versions. Le même code est placé en tête de
// vendor/pdf.worker.min.js, qui tourne à part et doit avoir le sien.
if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype.values = function ({preventCancel = false} = {}) {
    const reader = this.getReader();
    return {
      next() { return reader.read(); },
      async return(value) {
        if (!preventCancel) { try { await reader.cancel(value); } catch (e) {} }
        reader.releaseLock();
        return {done: true, value};
      },
      [Symbol.asyncIterator]() { return this; }
    };
  };
  ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
}
