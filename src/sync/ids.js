// Firestore document names can't contain "/" (it separates path parts), and "." / ".." or
// names wrapped in "__" are reserved. Progress keys like "r:kouyu-rumen/1/r1" need encoding.
// The real key is also stored inside each document ("k"), so this never has to be decoded.
export const docId = (key) => key.replace(/[/%]/g, (c) => (c === "/" ? "%2F" : "%25"));
