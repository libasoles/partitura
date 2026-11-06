// Only published demos can be opened through a shared URL.
export const DEMOS = [{
  id: 'canto-en-la-rama',
  title: 'Canto en la rama',
  author: 'Aca Seca Trío / Leda Valladares',
  url: '/demos/Canto%20en%20la%20rama%20-%203%20voces.musicxml',
}];

export const demoPath = (locale, demo) => `/${locale}/demos/${demo.id}/`;

export function demoLink(demo, href) {
  const url = new URL(href);
  url.pathname = demoPath(url.pathname.split('/')[1], demo);
  url.searchParams.delete('demo');
  url.searchParams.set('tools', 'voices,play,intervals');
  url.searchParams.set('sound', 'uh');
  url.searchParams.set('banner', 'hide');
  return url;
}
