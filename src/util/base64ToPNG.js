const Jimp = require("jimp");

function base64ToPNG(data) {
  data = data.replace(/^data:image\/png;base64,/, "");

  const buffer = Buffer.from(data, "base64");
  Jimp.read(buffer, (err, res) => {
    if (err) throw new Error(err);
    res.quality(5).write("resized.png");
  });
}

module.exports = base64ToPNG;
