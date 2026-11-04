using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconFix
{
    // Make the white canvas corners transparent, preserving the anti-aliased edge.
    // alpha = clamp((200 - min(r,g,b)) / 140, 0, 1): white(251)->0, dark(22)->1, cyan(45)->1
    public static void Run(string srcPath, string dstPath)
    {
        using (var src = new Bitmap(srcPath))
        using (var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bmp))
                g.DrawImage(src, 0, 0, src.Width, src.Height);
            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int bytes = Math.Abs(data.Stride) * bmp.Height;
            var px = new byte[bytes];
            Marshal.Copy(data.Scan0, px, 0, bytes);
            for (int y = 0; y < bmp.Height; y++)
            {
                int row = y * Math.Abs(data.Stride);
                for (int x = 0; x < bmp.Width; x++)
                {
                    int i = row + x * 4;
                    byte b = px[i], g = px[i + 1], r = px[i + 2];
                    int minc = Math.Min(r, Math.Min(g, b));
                    int a = (200 - minc) * 255 / 140;
                    if (a < 0) a = 0; else if (a > 255) a = 255;
                    px[i + 3] = (byte)a;
                }
            }
            Marshal.Copy(px, 0, data.Scan0, bytes);
            bmp.UnlockBits(data);
            bmp.Save(dstPath, ImageFormat.Png);
        }
    }
}
