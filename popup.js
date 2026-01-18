document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const form = document.getElementById('form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');
    
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
       
        const injection = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: () => {
                // DOI Detection
                const doiMeta = document.querySelector('meta[name="citation_doi"]') 
                             || document.querySelector('meta[name="dc.identifier"]')
                             || document.querySelector('meta[property="citation_doi"]');
                const doi = doiMeta ? doiMeta.content : null;

                // PMID Detection
                const pmidMeta = document.querySelector('meta[name="citation_pmid"]')
                              || document.querySelector('meta[name="ncbi_uidbase"]');
                const pmid = pmidMeta ? pmidMeta.content : null;

                return { doi, pmid };
            }
        });

        const { doi, pmid } = injection[0].result;

        let fetchedTitle = "";
        let fetchedAuthors = "";
        let fetchedAbstract = "";

       
        if (doi) {
            status.innerText = ` Detected DOI: ${doi}`;
            
            try {
                const res = await fetch(`https://api.crossref.org/works/${doi}`);
                if (res.ok) {
                    const data = await res.json();
                    const item = data.message;

                    if (item.title && item.title.length > 0) fetchedTitle = item.title[0];
                    if (item.author) fetchedAuthors = item.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(", ");
                    if (item.abstract) fetchedAbstract = item.abstract.replace(/<[^>]*>?/gm, '');
                }
            } catch (apiErr) {
                console.warn("CrossRef API failed", apiErr);
            }
        }

        
        if (pmid && (!fetchedTitle || !fetchedAbstract || !fetchedAuthors)) {
            status.innerText = ` Detected PMID: ${pmid}`;
            
            try {
                const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`);
                if (res.ok) {
                    const xmlText = await res.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

                    // Extract Title
                    if (!fetchedTitle) {
                        const titleNode = xmlDoc.querySelector("ArticleTitle");
                        if (titleNode) fetchedTitle = titleNode.textContent.trim();
                    }

                    // Extract Authors
                    if (!fetchedAuthors) {
                        const authorNodes = xmlDoc.querySelectorAll("Author");
                        const authors = [];
                        authorNodes.forEach(author => {
                            const lastName = author.querySelector("LastName")?.textContent || "";
                            const foreName = author.querySelector("ForeName")?.textContent || "";
                            const initials = author.querySelector("Initials")?.textContent || "";
                            
                            if (lastName) {
                                const fullName = foreName ? `${foreName} ${lastName}` : `${initials} ${lastName}`;
                                authors.push(fullName.trim());
                            }
                        });
                        if (authors.length > 0) fetchedAuthors = authors.join(", ");
                    }

                    // Extract Abstract
                    if (!fetchedAbstract) {
                        const abstractTexts = xmlDoc.querySelectorAll("AbstractText");
                        const abstractParts = [];
                        abstractTexts.forEach(node => {
                            const label = node.getAttribute("Label");
                            const text = node.textContent.trim();
                            if (text) {
                                abstractParts.push(label ? `${label}: ${text}` : text);
                            }
                        });
                        if (abstractParts.length > 0) {
                            fetchedAbstract = abstractParts.join("\n\n");
                        }
                    }
                }
            } catch (apiErr) {
                console.warn("PubMed API failed", apiErr);
            }
        }

        
        if (!fetchedTitle || !fetchedAbstract || !fetchedAuthors) {
            const pageData = await chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: () => {
                    const cleanText = (text) => {
                        if (!text) return "";
                        return text
                            .replace(/^(Abstract|Background|Introduction|Summary|ABSTRACT)\s*[:.-]?\s*/i, "")
                            .replace(/\s+/g, ' ')
                            .trim();
                    };

                    // ===== TITLE EXTRACTION =====
                    let scrapedTitle = "";
                    
                    // Try meta tags first
                    const metaTitleSelectors = [
                        'meta[name="citation_title"]',
                        'meta[property="og:title"]',
                        'meta[name="dc.title"]',
                        'meta[name="twitter:title"]'
                    ];
                    
                    for (let selector of metaTitleSelectors) {
                        const meta = document.querySelector(selector);
                        if (meta && meta.content && meta.content.trim()) {
                            scrapedTitle = meta.content.trim();
                            break;
                        }
                    }
                    
                    // Fallback to page elements
                    if (!scrapedTitle) {
                        const titleSelectors = [
                            'h1.heading-title',
                            'h1.content-title',
                            'h1[class*="title"]',
                            '.article-title',
                            '#article-title-1',
                            'h1'
                        ];
                        
                        for (let selector of titleSelectors) {
                            const el = document.querySelector(selector);
                            if (el && el.innerText && el.innerText.trim()) {
                                scrapedTitle = el.innerText.trim();
                                break;
                            }
                        }
                    }

                   
                    let scrapedAuthors = "";
                    
                    // Try meta tags
                    const authorMetas = document.querySelectorAll('meta[name="citation_author"], meta[name="dc.creator"], meta[name="author"]');
                    if (authorMetas.length > 0) {
                        const authors = [];
                        authorMetas.forEach(meta => {
                            if (meta.content && meta.content.trim()) {
                                authors.push(meta.content.trim());
                            }
                        });
                        if (authors.length > 0) {
                            scrapedAuthors = authors.join(", ");
                        }
                    }
                    
                    
                    if (!scrapedAuthors) {
                        const authorSelectors = [
                            '.authors-list',
                            '.author-list',
                            '.contributors',
                            '.authors',
                            '[class*="author"]',
                            '.citation-authors'
                        ];
                        
                        for (let selector of authorSelectors) {
                            const el = document.querySelector(selector);
                            if (el && el.innerText && el.innerText.trim()) {
                                scrapedAuthors = el.innerText
                                    .replace(/\n/g, ', ')
                                    .replace(/\s+/g, ' ')
                                    .replace(/,\s*,/g, ',')
                                    .trim();
                                if (scrapedAuthors.length > 10) break;
                            }
                        }
                    }

                    
                    let scrapedAbstract = "";
              
                    const abstractMetas = [
                        'meta[name="citation_abstract"]',
                        'meta[name="description"]',
                        'meta[property="og:description"]',
                        'meta[name="dc.description"]'
                    ];
                    
                    for (let selector of abstractMetas) {
                        const meta = document.querySelector(selector);
                        if (meta && meta.content && meta.content.length > 100) {
                            scrapedAbstract = cleanText(meta.content);
                            break;
                        }
                    }
                    
                    if (!scrapedAbstract) {
                        const abstractSelectors = [
                            '#eng-abstract',
                            '#abstract',
                            '#abs',
                            '#summary',
                            '.abstract-content',
                            '.abstract',
                            '.article-abstract',
                            '[class*="abstract"]',
                            '.tsec',
                            '#abstractBody',
                            '.abstract-text'
                        ];
                        
                        for (let selector of abstractSelectors) {
                            const el = document.querySelector(selector);
                            if (el && el.innerText) {
                                const text = cleanText(el.innerText);
                                if (text.length > 100) {
                                    scrapedAbstract = text;
                                    break;
                                }
                            }
                        }
                    }

                    return { 
                        title: scrapedTitle, 
                        authors: scrapedAuthors,
                        abstract: scrapedAbstract 
                    };
                }
            });

            if (pageData[0].result) {
                if (!fetchedTitle) fetchedTitle = pageData[0].result.title;
                if (!fetchedAuthors) fetchedAuthors = pageData[0].result.authors;
                if (!fetchedAbstract) fetchedAbstract = pageData[0].result.abstract;
            }
        }

        document.getElementById('title').value = fetchedTitle || "";
        document.getElementById('authors').value = fetchedAuthors || "";
        document.getElementById('abstract').value = fetchedAbstract || "";

        if (fetchedTitle && fetchedAbstract && fetchedAuthors) {
            status.className = "success";
            status.innerText = " Metadata extracted successfully!";
        } else if (fetchedTitle || fetchedAbstract) {
            status.className = "";
            status.innerText = " Partial data extracted. Please verify.";
        } else {
            status.className = "";
            status.innerText = " Auto-detection incomplete. Please fill manually.";
        }

    } catch (err) {
        console.error(err);
        status.className = "error";
        status.innerText = "⚠️ Auto-detection failed.";
    } finally {
        loading.classList.add('hidden');
        form.classList.remove('hidden');
    }

   
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
                submitBtn.innerText = "Submit to Community";
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
                status.innerText = " Saved! Opening Library...";
                
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
            status.innerText = " Network Error.";
            submitBtn.disabled = false;
            submitBtn.innerText = commCheckbox && commCheckbox.checked ? "Submit to Community" : "Submit to Library";
        }
    });
});