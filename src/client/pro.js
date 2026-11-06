// Las funciones Pro se activan con #pro en la URL (por ahora no hay cobro).
export const isPro = () => /^#(.*&)?pro(&.*)?$/.test(location.hash);
