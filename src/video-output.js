/* Clean local window output. Native NDI/Syphon requires a separate bridge. */
(function(){
  'use strict';
  class VideoOutput {
    constructor({canvas,onChange,onVisibility,onError}){
      this.canvas=canvas;this.onChange=onChange;this.onVisibility=onVisibility;this.onError=onError;
      this.window=null;this.stream=null;this._closedTimer=0;
    }
    get active(){return Boolean(this.window&&!this.window.closed&&this.stream);}
    get visible(){return this.active&&!this.window.document.hidden;}
    open(){
      if(this.active){this.window.focus();return;}
      if(typeof this.canvas.captureStream!=='function')throw new Error('Salida de video no disponible. Usa Chrome o Edge actualizado.');
      const out=window.open('','isdin-clean-output','popup=yes,width=1280,height=720,resizable=yes');
      if(!out)throw new Error('Permite las ventanas emergentes de este proyecto para abrir la salida de video.');
      this.window=out;
      try{
        const doc=out.document;doc.documentElement.lang='es';
        doc.head.replaceChildren();doc.body.replaceChildren();doc.title='ISDIN LAB — SALIDA LIMPIA';
        const style=doc.createElement('style');
        style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e4effc;cursor:none}video{display:block;width:100%;height:100%;object-fit:contain;background:#e4effc}';
        doc.head.append(style);
        const video=doc.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;
        video.setAttribute('aria-label','Salida limpia de la esfera ISDIN LAB');doc.body.append(video);
        this.stream=this.canvas.captureStream(60);video.srcObject=this.stream;
        const fullscreen=()=>{
          const request=doc.fullscreenElement?doc.exitFullscreen():doc.documentElement.requestFullscreen?.();
          request?.catch(()=>this.onError?.('Usa la opción de pantalla completa del navegador en la ventana de salida.'));
        };
        doc.addEventListener('dblclick',fullscreen);
        doc.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='f'){event.preventDefault();fullscreen();}});
        doc.addEventListener('visibilitychange',()=>this.onVisibility?.());
        out.addEventListener('pagehide',()=>{if(this.window===out)this.close();});
        this._closedTimer=setInterval(()=>{if(out.closed)this.close();},500);
        this.onChange?.(true);
        video.play().catch(error=>{if(this.window===out){this.close();this.onError?.('No se pudo iniciar la salida: '+error.message);}});
      }catch(error){this.close();throw error;}
    }
    close(){
      const out=this.window,stream=this.stream;this.window=null;this.stream=null;
      clearInterval(this._closedTimer);this._closedTimer=0;
      if(stream)for(const track of stream.getTracks())track.stop();
      if(out&&!out.closed)out.close();
      if(out||stream)this.onChange?.(false);
    }
  }
  window.VideoOutput=VideoOutput;
}());
