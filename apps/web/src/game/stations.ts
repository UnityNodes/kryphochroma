export interface Station {
  readonly id: string;
  readonly name: string;
  readonly genre: string;
  readonly license: string;
  readonly url: string;
  readonly site: string;
  readonly edge?: string;
}

/** Each station plays music that is free to broadcast (public domain, Creative Commons, NoCopyrightSounds or royalty free) and is streamed straight from its operator, never rehosted here. All are https, since a page served over https can not play an http stream. */
export const STATIONS: readonly Station[] = [
  { id: "retrostrange", name: "RetroStrange", genre: "Old time jazz", license: "Public domain", url: "https://icecast.retrostrange.com:8443/retrostrange-radio2-mp3", site: "https://retrostrange.com/radio2/" },
  { id: "lofi", name: "Lofi", genre: "Lo-fi beats", license: "cliamp radio", url: "https://radio.cliamp.stream/lofi/stream", site: "https://www.cliamp.stream/" },
  { id: "ncs-chill", name: "NCS Chill", genre: "Chillout", license: "NoCopyrightSounds", url: "https://radio.cliamp.stream/ncs-chill/stream", site: "https://ncs.io" },
  { id: "ncs-pop", name: "NCS Pop", genre: "Pop", license: "NoCopyrightSounds", url: "https://radio.cliamp.stream/ncs-pop/stream", site: "https://ncs.io" },
  { id: "ncs-house", name: "NCS House", genre: "House", license: "NoCopyrightSounds", url: "https://radio.cliamp.stream/ncs-house/stream", site: "https://ncs.io" },
  { id: "ncs-dnb", name: "NCS Drum and Bass", genre: "Drum and bass", license: "NoCopyrightSounds", url: "https://radio.cliamp.stream/ncs-dnb/stream", site: "https://ncs.io" },
  { id: "night-drive", name: "Night Drive", genre: "Synthwave", license: "Creative Commons", url: "https://stream.frekvenci.com/nightdrive", site: "https://frekvenci.com" },
  { id: "frekvenci-chill", name: "Frekvenci Chill", genre: "Chillwave", license: "Creative Commons", url: "https://stream.frekvenci.com/chill", site: "https://frekvenci.com" },
  { id: "space", name: "Space", genre: "Ambient synth", license: "Creative Commons", url: "https://stream.frekvenci.com/space", site: "https://frekvenci.com" },
  { id: "chiptune", name: "Chiptunes", genre: "8 bit", license: "cliamp radio", url: "https://radio.cliamp.stream/chiptune/stream", site: "https://www.cliamp.stream/" },
  { id: "royalty-free", name: "Royalty Free 24/7", genre: "Mixed instrumental", license: "Royalty free", url: "https://streams.radiomast.io/ref-128k-mp3-stereo", site: "https://www.radiomast.io/reference-streams", edge: "https://*.radiomast.io" },
];

export function stepStation(index: number, delta: number): number {
  return (((index + delta) % STATIONS.length) + STATIONS.length) % STATIONS.length;
}

/** A stream may answer with a redirect to an edge server on another host, and the content policy checks that host too, so a station can name the pattern its edges live under. */
export function mediaOrigins(): string[] {
  return [...new Set(STATIONS.flatMap((station) => [new URL(station.url).origin, ...(station.edge ? [station.edge] : [])]))];
}
