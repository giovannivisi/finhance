import { buildStoredZipArchive } from '@/common/zip';

function readStoredZipEntries(
  buffer: Buffer,
): Array<{ name: string; data: Buffer }> {
  const entries: Array<{ name: string; data: Buffer }> = [];
  let offset = 0;

  while (offset < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const dataStart = fileNameStart + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    entries.push({
      name: buffer.toString(
        'utf8',
        fileNameStart,
        fileNameStart + fileNameLength,
      ),
      data: buffer.subarray(dataStart, dataEnd),
    });

    offset = dataEnd;
  }

  return entries;
}

describe('zip utilities', () => {
  it('builds a stored zip archive with readable entries', () => {
    const archive = buildStoredZipArchive(
      [
        {
          name: 'accounts.csv',
          data: Buffer.from('name\nChecking\n', 'utf8'),
        },
        {
          name: 'notes/readme.txt',
          data: Buffer.from('ready', 'utf8'),
        },
      ],
      new Date('2026-05-20T08:15:00.000Z'),
    );

    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    expect(archive.includes(Buffer.from('accounts.csv', 'utf8'))).toBe(true);
    expect(archive.includes(Buffer.from('notes/readme.txt', 'utf8'))).toBe(
      true,
    );
    expect(readStoredZipEntries(archive)).toEqual([
      {
        name: 'accounts.csv',
        data: Buffer.from('name\nChecking\n', 'utf8'),
      },
      {
        name: 'notes/readme.txt',
        data: Buffer.from('ready', 'utf8'),
      },
    ]);
  });
});
