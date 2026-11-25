import { point, finishAt } from '../../src/lib/racing.js';

// A grid-aligned circuit with more than 256 genuine corners, plus redundant
// freehand samples. The inset is far enough away from every one-cell notch.
export function freehandTrack() {
  const outer=[point(0,0)];
  function side(start,forward,inward,teeth) {
    outer.push(start);
    for(let i=0;i<teeth;i++) {
      const x=start.x+forward.x*2*i,y=start.y+forward.y*2*i;
      outer.push(point(x+forward.x,y+forward.y),
        point(x+forward.x+inward.x,y+forward.y+inward.y),
        point(x+2*forward.x+inward.x,y+2*forward.y+inward.y),
        point(x+2*forward.x,y+2*forward.y));
    }
  }
  side(point(4,0),point(1,0),point(0,1),28);outer.push(point(64,0));
  side(point(64,4),point(0,1),point(-1,0),16);outer.push(point(64,40));
  side(point(60,40),point(-1,0),point(0,-1),28);outer.push(point(0,40));
  side(point(0,36),point(0,-1),point(1,0),16);
  const inner=[point(14,12),point(50,12),point(50,28),point(14,28)];
  const sample=poly=>poly.flatMap((a,i)=>{
    const b=poly[(i+1)%poly.length],steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y));
    return Array.from({length:steps},(_,j)=>point(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps));
  });
  const track={outer:sample(outer),inner:sample(inner),direction:1};
  return {...track,finish:finishAt(point(30,6),track)};
}
