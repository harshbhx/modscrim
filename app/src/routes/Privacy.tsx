import { copy, pages } from '../copy';

export function Privacy() {
  const { privacy } = pages;
  return (
    <>
      <h1>{privacy.title}</h1>
      <p>{copy['privacy.short']}</p>
      <h2>{privacy.stored}</h2>
      <ul>
        {privacy.storedItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>{privacy.neverStored}</p>
      <h2>{privacy.deleteTitle}</h2>
      <ul>
        {privacy.deleteItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
