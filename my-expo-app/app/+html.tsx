import { ScrollViewStyleReset } from 'expo-router/html';

// Expo Router web HTML document — sets global styles for the web build.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const webStyles = `
  *, *::before, *::after { box-sizing: border-box; }

  html, body, #root {
    height: 100%;
    margin: 0;
    padding: 0;
    background-color: #1A56DB;
  }

  /* Centre the app in a 480px phone shell on wider screens */
  #root > div {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #1A56DB;
  }

  /* The actual app shell */
  #root > div > div {
    width: 100%;
    max-width: 480px;
    height: 100vh;
    max-height: 900px;
    background-color: #F8F9FA;
    overflow: hidden;
    position: relative;
    box-shadow: 0 8px 40px rgba(0,0,0,0.25);
  }

  /* Mobile: full screen, no shadow */
  @media (max-width: 520px) {
    html, body, #root {
      background-color: #F8F9FA;
    }
    #root > div {
      background-color: #F8F9FA;
    }
    #root > div > div {
      max-width: 100%;
      height: 100vh;
      max-height: 100vh;
      box-shadow: none;
    }
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }

  /* Remove input default styles */
  input, textarea { font-family: inherit; }

  /* Prevent text selection on buttons */
  button { user-select: none; }
`;
