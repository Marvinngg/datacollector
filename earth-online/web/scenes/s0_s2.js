// placeholder — replaced by the scene author
(function () {
  const { text, P, F, World } = E;
  for (const id of ['s0_boot','s1_school','s2_empty']) E.register(id, { draw(ctx, lt, sc) {
    const cam = { x: World.home.x, y: World.home.y, zoom: 0.6 };
    World.draw(cam, { fog: 0.6, t: lt, reveal: [{ x: World.home.x, y: World.home.y, r: 600 }] });
    World.player(cam, World.home.x, World.home.y, { t: lt });
    text(sc.id + '  ' + lt.toFixed(2), 60, 80, { family: F.mono, size: 28, color: P.dim });
    text('地球 Online 任务日志 挣钱', 60, 140, { family: F.sans, size: 40 });
  }});
})();
