// noVNC 1.7 exports its ESM entry point at the package root. The community
// declarations still name the equivalent pre-1.7 entry point.
declare module "@novnc/novnc" {
  import RFB from "@novnc/novnc/lib/rfb"
  export default RFB
}
