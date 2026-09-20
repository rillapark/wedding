'use strict';
// Shared by the interactive floor plan and PNG export. y is in a 1,000-unit hall.
const HALL_LAYOUT = {
 width:370,height:1000,
 tables:Array.from({length:20},(_,i)=>({
  x:i<10?[26,18,27,18,26,18,27,18,30,26][i]:[74,82,73,82,74,82,73,82,74,50][i-10],
  y:i===19?925:149+(i%10)*78
 }))
};
function seatingAngle(tableIndex,seatIndex,capacity){return (tableIndex===10?-120:-60)*Math.PI/180+seatIndex*2*Math.PI/capacity}
