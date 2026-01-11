document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const form = document.getElementById('form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');
    
    // UI Elements for Community Logic
    const commCheckbox = document.getElementById('add_to_community');
    const commSection = document.getElementById('community_section');

    if (commCheckbox) {
        commCheckbox.addEventListener('change', () => {
            if (commCheckbox.checked) {
                commSection.classList.remove('hidden');
                submitBtn.innerText = "Submit to Community";
            } else {
                commSection.classList.add('hidden');
                submitBtn.innerText = "Submit to Library";
            }
        });
    }

    // 1. Get current tab URL
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    document.getElementById('article_link').value = tab.url;

    try {
        // 2. DOI Detection
        const injection = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: () => {
                const doiMeta = document.querySelector('meta[name="citation_doi"]') 
                             || document.querySelector('meta[name="dc.identifier"]');
                return doiMeta ? doiMeta.content : null;
            }
        });

        const doi = injection[0].result;

      
        let fetchedTitle = "";
        let fetchedAuthors = "";
        let fetchedAbstract = "";

        if (doi) {
            status.innerText = `✅ Detected DOI: ${doi}`;
            
            //  Fetch Metadata from CrossRef
            try {
                const res = await fetch(`https://api.crossref.org/works/${doi}`);
                if (res.ok) {
                    const data = await res.json();
                    const item = data.message;

                    if (item.title && item.title.length > 0) fetchedTitle = item.title[0];
                    if (item.author) fetchedAuthors = item.author.map(a => `${a.given} ${a.family}`).join(", ");
                    if (item.abstract) fetchedAbstract = item.abstract.replace(/<[^>]*>?/gm, '');
                }
            } catch (apiErr) {
                console.warn("CrossRef API failed", apiErr);
            }
        } else {
            status.innerText = "⚠️ No DOI found. Scanning page...";
        }

        // 4. FALLBACK SCRAPER
        if (!fetchedTitle || !fetchedAbstract) {
            const pageData = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () => {
                    const cleanText = (text) => text ? text.replace(/^(Abstract|Background|Introduction|Summary)\s*[:.-]?\s*/i, "").trim() : "";

                    // Title
                    const metaTitle = document.querySelector('meta[name="citation_title"]') || document.querySelector('meta[property="og:title"]');
                    const h1Title = document.querySelector('h1');
                    let scrapedTitle = metaTitle ? metaTitle.content : (h1Title ? h1Title.innerText : "");

                    // Abstract
                    let scrapedAbstract = "";
                    const metaAbs = document.querySelector('meta[name="citation_abstract"]') || document.querySelector('meta[name="description"]');
                    if (metaAbs && metaAbs.content.length > 150) scrapedAbstract = cleanText(metaAbs.content);
                    
                    if (!scrapedAbstract) {
                        const ids = ['eng-abstract', 'abstract', 'abs', 'summary'];
                        for (let id of ids) {
                            const el = document.getElementById(id);
                            if (el) { scrapedAbstract = cleanText(el.innerText); break; }
                        }
                    }
                    if (!scrapedAbstract) {
                        const classes = ['.abstract-content', '.abstract', '.tsec'];
                        for (let cls of classes) {
                            const el = document.querySelector(cls);
                            if (el) { scrapedAbstract = cleanText(el.innerText); break; }
                        }
                    }
                    return { title: scrapedTitle, abstract: scrapedAbstract };
                }
            });

            if (pageData[0].result) {
                if (!fetchedTitle) fetchedTitle = pageData[0].result.title;
                if (!fetchedAbstract) fetchedAbstract = pageData[0].result.abstract;
            }
        }

        // 5. Fill Form
        document.getElementById('title').value = fetchedTitle || "";
        document.getElementById('authors').value = fetchedAuthors || "";
        document.getElementById('abstract').value = fetchedAbstract || "";

    } catch (err) {
        console.error(err);
        status.innerText = "⚠️ Auto-detection failed.";
    } finally {
        loading.classList.add('hidden');
        form.classList.remove('hidden');
    }

    // Handle Submit
    submitBtn.addEventListener('click', async () => {
        let token = document.getElementById('token').value.trim();
        
        if (token.startsWith('"') && token.endsWith('"')) {
            token = token.slice(1, -1);
        }

        if (!token) {
            status.className = "error";
            status.innerText = "Please enter an Auth Token.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";

        const authorString = document.getElementById('authors').value;
        const authorList = authorString.split(',').map(name => ({
            label: name.trim(),
            value: name.trim()
        })).filter(a => a.value);

        let subType = "Public";
        let communityName = null;

        if (commCheckbox && commCheckbox.checked) {
            communityName = document.getElementById('community_name').value;
            subType = document.getElementById('submission_type').value;
            
            if (!communityName) {
                status.className = "error";
                status.innerText = "Community Name is required.";
                submitBtn.disabled = false;
                return;
            }
        }

        const articleData = {
            payload: {
                title: document.getElementById('title').value,
                abstract: document.getElementById('abstract').value,
                authors: authorList,
                article_link: document.getElementById('article_link').value,
                submission_type: subType,
                community_name: communityName
            }
        };

        const formData = new FormData();
        formData.append('details', JSON.stringify(articleData));

        try {
            // *** EXACT URL FROM SWAGGER ***
            const response = await fetch('http://127.0.0.1:8000/api/articles/articles/', { 
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                status.className = "success";
                status.innerText = "✅ Saved! Opening Library...";
                
                const targetUrl = `http://localhost:3000/articles/${result.slug}`;
                chrome.tabs.create({ url: targetUrl });
                window.close();
                
            } else {
                const errText = await response.text();
                console.error("Server Error:", errText);
                status.className = "error";
              
                if (response.status === 401) {
                    status.innerText = "Unauthorized. Check your Token.";
                } else {
                    status.innerText = "Error: " + response.status;
                }
                submitBtn.disabled = false;
                submitBtn.innerText = commCheckbox && commCheckbox.checked ? "Submit to Community" : "Submit to Library";
            }
        } catch (error) {
            console.error(error);
            status.className = "error";
            status.innerText = "❌ Network Error.";
            submitBtn.disabled = false;
            submitBtn.innerText = commCheckbox && commCheckbox.checked ? "Submit to Community" : "Submit to Library";
        }
    });
});