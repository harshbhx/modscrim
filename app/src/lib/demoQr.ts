import { create } from 'qrcode';

export interface DemoQrMatrix {
  size: number;
  path: string;
}

export function createDemoQrMatrix(value: string): DemoQrMatrix {
  const code = create(value, { errorCorrectionLevel: 'M' });
  const commands: string[] = [];
  for (let row = 0; row < code.modules.size; row += 1) {
    for (let column = 0; column < code.modules.size; column += 1) {
      if (code.modules.get(row, column)) commands.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  return { size: code.modules.size, path: commands.join('') };
}
