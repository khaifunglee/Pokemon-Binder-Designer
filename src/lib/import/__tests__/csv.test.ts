import { parseCsv } from '../csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF and trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas and newlines', () => {
    expect(parseCsv('"Pikachu - 025/198","a,b","line1\nline2"')).toEqual([
      ['Pikachu - 025/198', 'a,b', 'line1\nline2'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', 'x']]);
  });

  it('keeps empty fields but drops fully blank rows', () => {
    expect(parseCsv('a,,c\n,,\n1,2,3')).toEqual([
      ['a', '', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses empty input to no rows', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});
