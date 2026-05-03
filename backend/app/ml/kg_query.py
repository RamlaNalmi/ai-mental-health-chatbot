# ml/kg_query.py
import torch
from transformers import BertTokenizer, BertModel
from sklearn.metrics.pairwise import cosine_similarity
from neo4j import GraphDatabase
import os

# Neo4j configuration
NEO4J_URI = "neo4j://127.0.0.1:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "Rismiya_n24"
NEO4J_DB = "stress"

# Initialize BERT
tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
bert_model = BertModel.from_pretrained("bert-base-uncased")

def bert_encode(texts):
    """
    Encode text using BERT.
    """
    encoded = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
    with torch.no_grad():
        outputs = bert_model(**encoded)
    return outputs.last_hidden_state.mean(dim=1)

def get_kg_nodes():
    """
    Get all knowledge graph nodes.
    """
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session(database=NEO4J_DB) as session:
            result = session.run("MATCH (n) WHERE n:Symptom OR n:StressTrigger OR n:StressCategory OR n:CopingMechanism RETURN n.name AS name, labels(n) AS labels")
            nodes = [{"name": r["name"], "labels": r["labels"]} for r in result]
        driver.close()
        return nodes
    except Exception as e:
        print(f"KG connection failed: {e}")
        return []

# Pre-load KG nodes and embeddings
kg_nodes = get_kg_nodes()
kg_texts = [node["name"] for node in kg_nodes]
if kg_texts:
    with torch.no_grad():
        kg_embeddings = bert_encode(kg_texts).cpu().numpy()
else:
    kg_embeddings = []

def match_concepts_hybrid(text, top_k=10, threshold=0.51):
    """
    Match concepts in text to knowledge graph nodes.
    """
    if not kg_nodes or not kg_texts:
        return [], [], [], []
    
    with torch.no_grad():
        text_emb = bert_encode([text]).cpu().numpy()
    sims = cosine_similarity(text_emb, kg_embeddings)[0]
    matched_symptoms, matched_triggers, matched_categories, matched_coping = [], [], [], []

    for i, node in enumerate(kg_nodes):
        node_name_lower = node["name"].lower()
        text_lower = text.lower()
        score = sims[i]
        if node_name_lower in text_lower:
            score += 0.3
        if score >= threshold:
            labels = node["labels"]
            if "Symptom" in labels: matched_symptoms.append((node["name"], score))
            elif "StressTrigger" in labels: matched_triggers.append((node["name"], score))
            elif "StressCategory" in labels: matched_categories.append((node["name"], score))
            elif "CopingMechanism" in labels: matched_coping.append((node["name"], score))

    matched_symptoms = [x[0] for x in sorted(matched_symptoms, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_triggers = [x[0] for x in sorted(matched_triggers, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_categories = [x[0] for x in sorted(matched_categories, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_coping = [x[0] for x in sorted(matched_coping, key=lambda x: x[1], reverse=True)[:top_k]]

    return matched_symptoms, matched_triggers, matched_categories, matched_coping

def query_kg_filtered(symptoms, triggers):
    """
    Query knowledge graph for related concepts.
    """
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        with driver.session(database=NEO4J_DB) as session:
            result = session.run("""
                MATCH (s:Symptom) WHERE s.name IN $symptoms
                OPTIONAL MATCH (s)<-[:CAUSES]-(t:StressTrigger) WHERE t.name IN $triggers
                OPTIONAL MATCH (t)-[:BELONGS_TO]->(c:StressCategory)
                OPTIONAL MATCH (t)-[:CAN_BE_REDUCED_BY]->(cop:CopingMechanism)
                RETURN collect(DISTINCT s.name) AS symptoms,
                       collect(DISTINCT t.name) AS triggers,
                       collect(DISTINCT c.name) AS categories,
                       collect(DISTINCT cop.name) AS coping
            """, symptoms=symptoms, triggers=triggers)
            for r in result:
                return dict(r)
        driver.close()
    except Exception as e:
        print(f"KG query failed: {e}")
    
    return {"symptoms": [], "triggers": [], "categories": [], "coping": []}
