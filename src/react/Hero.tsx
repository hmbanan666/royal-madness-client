import { useAppDispatch, useAppSelector } from "../hooks";
import { useEffect, useRef, useState } from "react";
import { FPS } from "../assets/constants";
import { setHeroPosition } from "../redux/slices/hero";

export const Hero = () => {
  const dispatch = useAppDispatch();
  const { x, y, direction, movingTo, speed } = useAppSelector(
    (state) => state.hero
  );

  const [heroX, setHeroX] = useState(x);
  const [heroY, setHeroY] = useState(y);
  const heroDivRef = useRef(null);

  // On direction change
  useEffect(() => {
    if (!heroDivRef.current) return;
    // @ts-ignore
    heroDivRef.current?.setAttribute("data-walking", "true");
    // @ts-ignore
    heroDivRef.current?.setAttribute("data-facing", direction);
  }, [direction]);

  useEffect(() => {
    if (heroX === undefined || heroX === null || movingTo.x <= 0) return;

    let intervalX: any;

    // how far to go
    const distanceX = Math.abs(movingTo.x - heroX);
    // where to go
    const direction = movingTo.x >= heroX ? "RIGHT" : "LEFT";

    if (distanceX >= 1) {
      intervalX = setInterval(() => {
        if (direction === "RIGHT") setHeroX((prev) => prev + speed);
        if (direction === "LEFT") setHeroX((prev) => prev - speed);
      }, FPS);
    }

    dispatch(setHeroPosition({ x: heroX, y: heroY }));

    return () => clearInterval(intervalX);
  }, [movingTo, heroX]);

  useEffect(() => {
    if (heroY === undefined || heroY === null || movingTo.y <= 0) return;

    let intervalY: any;

    // how far to go
    const distanceY = Math.abs(movingTo.y - heroY);
    // where to go
    const direction = movingTo.y >= heroY ? "DOWN" : "UP";

    if (distanceY >= 1) {
      intervalY = setInterval(() => {
        if (direction === "DOWN") setHeroY((prev) => prev + speed);
        if (direction === "UP") setHeroY((prev) => prev - speed);
      }, FPS);
    }

    dispatch(setHeroPosition({ x: heroX, y: heroY }));

    return () => clearInterval(intervalY);
  }, [movingTo, heroY]);

  return (
    <div
      ref={heroDivRef}
      className="hero"
      data-facing="down"
      data-walking="false"
      style={{ top: heroY, left: heroX }}
    >
      <div className="shadow pixel-art"></div>
      <div className="hero_spritesheet pixel-art"></div>
    </div>
  );
};
