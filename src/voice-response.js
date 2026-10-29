/* Voice-only movement gate. Uses real RMS to stop motion during genuine pauses.
 * step(dt, analyserFeatures, playing=true) -> active, drive, expand, flowRate, attack.
 * drive/expand/attack are 0..1. flowRate is a phase rate in radians/second.
 * A quiet interval closes the hysteresis gate after 65 ms and finishes the
 * smooth release at 160 ms, then returns exact zeros (no permanent idle flow).
 */
(function () {
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const smooth=value=>{const x=clamp(value,0,1);return x*x*(3-2*x);};
  const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;

  class VoiceResponse {
    constructor(){this.reset();}
    reset(){
      this._gate=false;
      this._quietAge=0;
      this._drive=0;
      this._releaseStart=0;
      this._releasing=false;
      this._attack=0;
    }
    step(dt,features={},playing=true){
      const elapsed=clamp(finite(dt,1/60),0,.5);
      const rms=playing?clamp(finite(features.rms),0,1):0;
      const hasVoice=rms>=(this._gate?.0025:.004);
      if(hasVoice){
        this._gate=true;
        this._quietAge=0;
        this._releasing=false;
        // Retain sensitivity from the already mapped envelope while keeping
        // detection independent of its trailing release. Undefined envelope
        // means unity sensitivity; an explicit zero disables the visual drive.
        const referenceEnvelope=1-Math.exp(-rms*4);
        const envelope=clamp(finite(features.envelope,referenceEnvelope),0,1);
        const sensitivity=clamp(envelope/Math.max(.02,referenceEnvelope),0,2.2);
        const target=1-Math.exp(-20*rms*Math.sqrt(sensitivity));
        const tau=target>this._drive?.022:.050;
        this._drive+=(target-this._drive)*(1-Math.exp(-elapsed/tau));
        const transient=clamp(finite(features.attack),0,1);
        this._attack+=(transient-this._attack)*(1-Math.exp(-elapsed/(transient>this._attack?.015:.055)));
      }else{
        if(!this._releasing){this._releaseStart=this._drive;this._releasing=true;}
        this._quietAge+=elapsed;
        if(this._quietAge>=.065)this._gate=false;
        const release=1-smooth((this._quietAge-.055)/.105);
        this._drive=this._releaseStart*release;
        this._attack*=Math.exp(-elapsed/.040);
        if(this._quietAge>=.160){this._drive=0;this._attack=0;}
      }
      this._drive=clamp(this._drive,0,1);
      const active=this._drive>0;
      const mid=clamp(finite(features.mid),0,1);
      return {
        active,
        drive:this._drive,
        expand:active?Math.pow(this._drive,.9):0,
        flowRate:active?this._drive*(2.8+.7*Math.sqrt(mid)):0,
        attack:active?clamp(this._attack,0,1):0
      };
    }
  }
  if(typeof window!=='undefined')window.VoiceResponse=VoiceResponse;
  if(typeof module!=='undefined'&&module.exports)module.exports=VoiceResponse;
}());
